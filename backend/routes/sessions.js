const express = require("express");
const mongoose = require("mongoose");
const Session = require("../models/Session");
const RoundAttempt = require("../models/RoundAttempt");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const CodeSubmission = require("../models/CodeSubmission");
const requireAuth = require("../middleware/auth");
const { scoreTheoryAnswer, codeSimilarity } = require("../utils/scoring");
const { runCode, isMockMode } = require("../utils/judge0");
const { detectApproachTags } = require("../utils/approachDetector");
const { assignQuestions, validateRoundSequence } = require("../utils/companyPattern");

const router = express.Router();

const BANK_BY_TYPE = { aptitude: AptitudeQuestion, coding: CodingQuestion, theory: TheoryQuestion };

function normalizeAnswerList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
  if (value == null) return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean).sort();
  if (typeof value === "object") {
    const nested = value.selected_options || value.selected_option || value.options || [];
    return normalizeAnswerList(nested);
  }
  return [];
}

function sameAnswerSet(expected, actual) {
  return JSON.stringify(normalizeAnswerList(expected)) === JSON.stringify(normalizeAnswerList(actual));
}

async function activeRoundIndex(session) {
  for (let index = 0; index < session.drive_rounds.length; index += 1) {
    const round = session.drive_rounds[index];
    const submittedCount = await RoundAttempt.countDocuments({
      session: session._id,
      round_type: round.round_type,
    });
    if (submittedCount < round.question_ids.length) return index;
  }
  return session.drive_rounds.length;
}

// ---------------------------------------------------------------
// POST /api/sessions/start
// mock_drive: { mode: 'mock_drive', companyId }
// single_question: { mode: 'single_question', category, difficulty }
// ---------------------------------------------------------------
router.post("/start", requireAuth, async (req, res) => {
  try {
    const { mode, companyId, category, difficulty } = req.body;
    if (!["mock_drive", "single_question"].includes(mode)) {
      return res.status(400).json({ message: "mode must be mock_drive or single_question" });
    }

    let company = null;
    let roundSequence = [];
    let assignedRounds = [];

    if (mode === "mock_drive") {
      if (!companyId) return res.status(400).json({ message: "companyId is required for a mock drive" });
      company = await Company.findById(companyId);
      if (!company) return res.status(404).json({ message: "Company not found" });
      const pattern = await CompanyPattern.findOne({ company: company._id });
      if (!pattern || pattern.round_sequence.length === 0) {
        return res.status(409).json({ message: "This company has no saved mock-drive settings. Ask an admin to configure its rounds before starting." });
      }
      const validationError = validateRoundSequence(pattern.round_sequence.map((round) => round.toObject()));
      if (validationError) return res.status(409).json({ message: `Invalid mock-drive settings for ${company.name}: ${validationError}` });
      roundSequence = pattern.round_sequence
        .filter((round) => round.enabled !== false)
        .map((round) => ({
          round_type: round.round_type,
          question_count: round.question_count,
          time_limit_seconds: round.time_limit_seconds,
          category: round.category || null,
          difficulty: round.difficulty || null,
          included_topics: round.included_topics || [],
          difficulty_distribution: round.difficulty_distribution || { easy: 0, medium: 0, hard: 0 },
        }));

      try {
        for (const round of roundSequence) {
          const questionIds = await assignQuestions(BANK_BY_TYPE[round.round_type], round, company.name);
          assignedRounds.push({ ...round, question_ids: questionIds });
        }
      } catch (err) {
        return res.status(409).json({ message: err.message });
      }
    } else {
      // single_question mode is always one theory round by default in this build
      roundSequence = [{ round_type: "theory", question_count: 1, category: category || null, difficulty: difficulty || "Medium", time_limit_seconds: 420 }];
    }

    const session = await Session.create({
      user: req.userId,
      company: company ? company._id : null,
      mode,
      drive_rounds: assignedRounds,
    });

    res.status(201).json({
      sessionId: session._id,
      mode,
      company: company ? { id: company._id, name: company.name } : null,
      round_sequence: roundSequence.map(({ included_topics, difficulty_distribution, ...round }) => round),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error starting session" });
  }
});

// ---------------------------------------------------------------
// GET /api/sessions/:id/next-question?roundType=aptitude&category=&difficulty=
// Returns a random question, excluding ones already attempted in this session.
// Correct answers / hidden test cases are stripped before sending.
// ---------------------------------------------------------------
router.get("/:id/next-question", requireAuth, async (req, res) => {
  try {
    const { roundType, category, difficulty, questionIndex } = req.query;
    const Bank = BANK_BY_TYPE[roundType];
    if (!Bank) return res.status(400).json({ message: "roundType must be aptitude, coding, or theory" });

    const session = await Session.findOne({ _id: req.params.id, user: req.userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.completed_at) return res.status(409).json({ message: "This drive has already ended." });

    if (session.mode === "mock_drive" && session.drive_rounds.length > 0) {
      const roundIndex = session.drive_rounds.findIndex((round) => round.round_type === roundType);
      if (await activeRoundIndex(session) !== roundIndex) {
        return res.status(409).json({ message: "This is not the active round for this drive." });
      }
      const round = session.drive_rounds.find((item) => item.round_type === roundType);
      const index = Number(questionIndex);
      if (!round || !Number.isInteger(index) || index < 0 || index >= round.question_ids.length) {
        return res.status(400).json({ message: "A valid questionIndex is required for this configured round." });
      }
      const questionId = round.question_ids[index];
      const question = await Bank.findById(questionId);
      if (!question) return res.status(409).json({ message: "A question assigned to this drive is no longer available. Please start a new drive." });
      const q = question.toObject();
      if (roundType === "aptitude") {
        delete q.correct_option;
        delete q.correct_options;
      }
      if (roundType === "coding") {
        q.test_cases = q.test_cases.map((tc) => (tc.hidden ? { hidden: true } : tc));
      }
      return res.json(q);
    }

    const alreadyAttempted = await RoundAttempt.find({ session: session._id, round_type: roundType }).distinct("question_id");

    const filter = { _id: { $nin: alreadyAttempted } };
    if (category) filter[roundType === "theory" ? "subject" : "category"] = category;
    if (difficulty) filter.difficulty = difficulty;

    const count = await Bank.countDocuments(filter);
    if (count === 0) return res.status(404).json({ message: "No more questions available for this selection" });

    const question = await Bank.findOne(filter).skip(Math.floor(Math.random() * count));
    const q = question.toObject();

    if (roundType === "aptitude") {
      delete q.correct_option;
      delete q.correct_options;
    }
    if (roundType === "coding") {
      q.test_cases = q.test_cases.map((tc) => (tc.hidden ? { hidden: true } : tc));
    }

    res.json(q);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching next question" });
  }
});

router.get("/:id/aptitude-set", requireAuth, async (req, res) => {
  try {
    const { category, difficulty, limit = 10 } = req.query;
    const session = await Session.findOne({ _id: req.params.id, user: req.userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.completed_at) return res.status(409).json({ message: "This drive has already ended." });

    if (session.mode === "mock_drive" && session.drive_rounds.length > 0) {
      const round = session.drive_rounds.find((item) => item.round_type === "aptitude");
      if (!round) return res.status(404).json({ message: "Aptitude round is not enabled for this drive." });
      const roundIndex = session.drive_rounds.findIndex((item) => item.round_type === "aptitude");
      if (await activeRoundIndex(session) !== roundIndex) {
        return res.status(409).json({ message: "This is not the active round for this drive." });
      }
      const questions = await AptitudeQuestion.find({ _id: { $in: round.question_ids } }).lean();
      const questionsById = new Map(questions.map((question) => [String(question._id), question]));
      const orderedQuestions = round.question_ids.map((id) => questionsById.get(String(id)));
      if (orderedQuestions.some((question) => !question)) {
        return res.status(409).json({ message: "A question assigned to this drive is no longer available. Please start a new drive." });
      }
      const safeQuestions = orderedQuestions.map((question) => {
        const q = { ...question };
        const correctOptions = Array.isArray(q.correct_options) && q.correct_options.length > 0
          ? q.correct_options
          : (q.correct_option ? [q.correct_option] : []);
        q.multiple_answers = correctOptions.length > 1;
        delete q.correct_option;
        delete q.correct_options;
        return q;
      });
      return res.json(safeQuestions);
    }

    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;

    const sampleSize = Math.max(1, Number(limit) || 10);
    const questions = await AptitudeQuestion.aggregate([
      { $match: filter },
      { $sample: { size: Math.min(sampleSize, await AptitudeQuestion.countDocuments(filter)) } },
    ]);

    const safeQuestions = questions.map((question) => {
      const q = { ...question };
      const correctOptions = Array.isArray(q.correct_options) && q.correct_options.length > 0
        ? q.correct_options
        : (q.correct_option ? [q.correct_option] : []);
      q.multiple_answers = correctOptions.length > 1;
      delete q.correct_option;
      delete q.correct_options;
      return q;
    });

    res.json(safeQuestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching aptitude set" });
  }
});

// ---------------------------------------------------------------
// POST /api/sessions/:id/submit-round
// body: { round_type, question_id, response, time_taken, tab_switch_count }
//   aptitude response: { selected_option }
//   coding response:   { code, language }
//   theory response:   { answer_text }
// ---------------------------------------------------------------
async function submitRoundHandler(req, res) {
  try {
    const { round_type, question_id, response, time_taken, tab_switch_count, paste_count } = req.body;
    if (typeof round_type !== "string" || typeof question_id !== "string"
      || !response || typeof response !== "object" || Array.isArray(response)) {
      return res.status(400).json({ message: "A valid round, question, and response are required." });
    }
    const session = await Session.findOne({ _id: req.params.id, user: req.userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.completed_at) {
      return res.status(409).json({ message: "This drive has already ended." });
    }
    if (session.mode === "mock_drive" && session.drive_rounds.length > 0) {
      const round = session.drive_rounds.find((item) => item.round_type === round_type);
      if (!round || !round.question_ids.some((id) => String(id) === String(question_id))) {
        return res.status(400).json({ message: "The submitted question was not assigned to this drive round." });
      }
      const existingAttempt = await RoundAttempt.findOne({ session: session._id, round_type, question_id });
      if (existingAttempt) {
        return res.status(200).json({
          roundAttemptId: existingAttempt._id,
          round_score: existingAttempt.round_score,
          category: existingAttempt.category,
          difficulty: existingAttempt.difficulty,
          response: existingAttempt.response,
          jaccard_score: existingAttempt.jaccard_score,
          tfidf_score: existingAttempt.tfidf_score,
          matched_concepts: existingAttempt.matched_concepts,
          missing_concepts: existingAttempt.missing_concepts,
          test_cases_passed: existingAttempt.test_cases_passed,
          test_cases_total: existingAttempt.test_cases_total,
          test_results: existingAttempt.test_results,
          matched_approach_tags: existingAttempt.matched_approach_tags,
          missing_approach_tags: existingAttempt.missing_approach_tags,
          mockJudge: round_type === "coding" ? isMockMode(response.language) : undefined,
        });
      }
      const currentIndex = await activeRoundIndex(session);
      const submittedIndex = session.drive_rounds.findIndex((item) => item.round_type === round_type);
      if (currentIndex !== submittedIndex) {
        return res.status(409).json({ message: "This round is no longer accepting answers." });
      }
    }

    let roundResult;

    if (round_type === "aptitude") {
      const q = await AptitudeQuestion.findById(question_id);
      if (!q) return res.status(404).json({ message: "Question not found" });

      const expected = Array.isArray(q.correct_options) && q.correct_options.length > 0
        ? q.correct_options
        : (q.correct_option ? [q.correct_option] : []);
      const selected = normalizeAnswerList(response.selected_options ?? response.selected_option ?? response);
      const correct = sameAnswerSet(expected, selected);

      roundResult = {
        round_score: correct ? 100 : 0,
        category: q.category,
        difficulty: q.difficulty,
        response: {
          selected_options: selected,
          correct_options: expected,
        },
      };
    } else if (round_type === "theory") {
      if (typeof response.answer_text !== "string") {
        return res.status(400).json({ message: "A theory answer is required." });
      }
      const q = await TheoryQuestion.findById(question_id);
      if (!q) return res.status(404).json({ message: "Question not found" });
      const scored = scoreTheoryAnswer(response.answer_text, q.ideal_concepts);
      roundResult = {
        round_score: scored.score,
        category: q.subject,
        difficulty: q.difficulty,
        response: { answer_text: response.answer_text },
        jaccard_score: scored.jaccardScore,
        tfidf_score: scored.tfidfScore,
        matched_concepts: scored.matchedConcepts,
        missing_concepts: scored.missingConcepts,
      };
    } else if (round_type === "coding") {
      if (typeof response.code !== "string" || typeof response.language !== "string") {
        return res.status(400).json({ message: "Code and programming language are required." });
      }
      const q = await CodingQuestion.findById(question_id);
      if (!q) return res.status(404).json({ message: "Question not found" });
      const results = await runCode(response.code, response.language, q.test_cases);
      const passed = results.filter((r) => r.passed).length;
      const approach = detectApproachTags(response.code, q.tags);
      roundResult = {
        round_score: Math.round((passed / results.length) * 100),
        category: q.tags[0] || "coding",
        difficulty: q.difficulty,
        response: { language: response.language },
        test_cases_passed: passed,
        test_cases_total: results.length,
        test_results: results,
        matched_approach_tags: approach.matched,
        missing_approach_tags: approach.missing,
      };
    } else {
      return res.status(400).json({ message: "Invalid round_type" });
    }

    const attempt = await RoundAttempt.create({
      session: session._id,
      round_type,
      question_id,
      category: roundResult.category,
      difficulty: roundResult.difficulty,
      response: roundResult.response,
      round_score: roundResult.round_score,
      time_taken: time_taken || 0,
      tab_switch_count: tab_switch_count || 0,
      paste_count: paste_count || 0,
      jaccard_score: roundResult.jaccard_score ?? null,
      tfidf_score: roundResult.tfidf_score ?? null,
      matched_concepts: roundResult.matched_concepts || [],
      missing_concepts: roundResult.missing_concepts || [],
      test_cases_passed: roundResult.test_cases_passed ?? null,
      test_cases_total: roundResult.test_cases_total ?? null,
      test_results: roundResult.test_results ?? null,
      matched_approach_tags: roundResult.matched_approach_tags || [],
      missing_approach_tags: roundResult.missing_approach_tags || [],
    });

    // coding round: store the submission + similarity check vs other submissions for same question
    if (round_type === "coding") {
      const priorSubmissions = await CodeSubmission.find({ question_id }).limit(50);
      let maxSimilarity = 0;
      priorSubmissions.forEach((s) => {
        const sim = codeSimilarity(response.code, s.code);
        if (sim > maxSimilarity) maxSimilarity = sim;
      });
      await CodeSubmission.create({
        round_attempt: attempt._id,
        question_id,
        code: response.code,
        language: response.language,
        similarity_score: maxSimilarity,
      });
    }

    res.status(201).json({ roundAttemptId: attempt._id, ...roundResult, mockJudge: round_type === "coding" ? isMockMode(response.language) : undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error scoring round" });
  }
}

router.post("/:id/submit-round", requireAuth, submitRoundHandler);

// ---------------------------------------------------------------
// POST /api/sessions/:id/complete — aggregate round scores into total_score
// ---------------------------------------------------------------
router.post("/:id/complete", requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.completed_at) {
      return res.json({ sessionId: session._id, total_score: session.total_score, rounds_completed: await RoundAttempt.countDocuments({ session: session._id }) });
    }

    const attempts = await RoundAttempt.find({ session: session._id });
    if (attempts.length === 0) return res.status(400).json({ message: "No rounds completed in this session yet" });
    if (session.mode === "mock_drive" && session.drive_rounds.length > 0) {
      for (const round of session.drive_rounds) {
        const submittedCount = attempts.filter((attempt) => attempt.round_type === round.round_type).length;
        if (submittedCount !== round.question_ids.length) {
          return res.status(400).json({ message: `Cannot complete the drive: ${round.round_type} has ${submittedCount} of ${round.question_ids.length} questions submitted.` });
        }
      }
    }

    const total = Math.round(attempts.reduce((sum, a) => sum + a.round_score, 0) / attempts.length);
    session.total_score = total;
    session.completed_at = new Date();
    await session.save();

    res.json({ sessionId: session._id, total_score: total, rounds_completed: attempts.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error completing session" });
  }
});

// ---------------------------------------------------------------
// GET /api/sessions/:id — full session summary with round attempts
// ---------------------------------------------------------------
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.userId }).populate("company", "name");
    if (!session) return res.status(404).json({ message: "Session not found" });
    const attempts = await RoundAttempt.find({ session: session._id }).sort({ createdAt: 1 });
    res.json({ session, round_attempts: attempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching session" });
  }
});

// ---------------------------------------------------------------
// GET /api/sessions/history — past sessions for the logged-in user
// ---------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.userId, completed_at: { $ne: null } })
      .sort({ completed_at: -1 })
      .limit(30)
      .populate("company", "name");

    const withRounds = await Promise.all(
      sessions.map(async (s) => {
        const attempts = await RoundAttempt.find({ session: s._id });
        const byType = Object.fromEntries(attempts.map((a) => [a.round_type, a.round_score]));
        return {
          id: s._id,
          mode: s.mode,
          company: s.company ? s.company.name : null,
          total_score: s.total_score,
          completed_at: s.completed_at,
          round_scores: byType,
        };
      })
    );
    res.json(withRounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching history" });
  }
});

// ---------------------------------------------------------------
// GET /api/sessions/stats/dashboard — aggregated dashboard numbers
// ---------------------------------------------------------------
router.get("/stats/dashboard", requireAuth, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.userId, completed_at: { $ne: null } }).sort({ completed_at: 1 });
    if (sessions.length === 0) {
      return res.json({ averageScore: 0, sessionsCompleted: 0, trend: [], roundStrength: [], weakSubjects: [], recent: [] });
    }

    const averageScore = Math.round(sessions.reduce((sum, s) => sum + (s.total_score || 0), 0) / sessions.length);
    const trend = sessions.slice(-8).map((s) => s.total_score || 0);

    const allAttempts = await RoundAttempt.find({ session: { $in: sessions.map((s) => s._id) } });

    const byRoundType = {};
    const bySubject = {};
    allAttempts.forEach((a) => {
      byRoundType[a.round_type] = byRoundType[a.round_type] || [];
      byRoundType[a.round_type].push(a.round_score);
      const key = a.category || "General";
      bySubject[key] = bySubject[key] || [];
      bySubject[key].push(a.round_score);
    });

    const roundStrength = Object.entries(byRoundType).map(([round_type, scores]) => ({
      round_type,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));

    const weakSubjects = Object.entries(bySubject)
      .map(([subject, scores]) => ({ subject, average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
      .sort((a, b) => a.average - b.average)
      .slice(0, 5);

    const recentSessions = sessions.slice(-5).reverse();
    const recent = await Promise.all(
      recentSessions.map(async (s) => {
        await s.populate("company", "name");
        return { date: s.completed_at, mode: s.mode, company: s.company ? s.company.name : "Single Practice", total_score: s.total_score };
      })
    );

    res.json({ averageScore, sessionsCompleted: sessions.length, trend, roundStrength, weakSubjects, recent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching dashboard stats" });
  }
});

module.exports = router;
