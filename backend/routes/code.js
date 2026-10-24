const express = require("express");
const CodingQuestion = require("../models/CodingQuestion");
const requireAuth = require("../middleware/auth");
const { runCode, isMockMode } = require("../utils/judge0");

const router = express.Router();

// POST /api/code/run — run submitted code against a question's VISIBLE test cases only.
// Nothing is persisted; this is purely for the student to check their work
// before the real scored submission via /api/sessions/:id/submit-round.
router.post("/run", requireAuth, async (req, res) => {
  try {
    const { questionId, code, language } = req.body;
    if (!questionId || !code) return res.status(400).json({ message: "questionId and code are required" });

    const question = await CodingQuestion.findById(questionId);
    if (!question) return res.status(404).json({ message: "Question not found" });

    const visibleCases = question.test_cases.filter((tc) => !tc.hidden);
    const results = await runCode(code, language, visibleCases);

    res.json({ results, mockJudge: isMockMode(language) });
  } catch (err) {
    if (err && err.code === "CODE_EXECUTION_NOT_CONFIGURED") {
      return res.status(503).json({ message: "Code execution is unavailable because Judge0 is not configured in production." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error running code" });
  }
});

module.exports = router;
