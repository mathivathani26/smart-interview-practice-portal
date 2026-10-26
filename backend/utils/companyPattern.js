const DIFFICULTIES = ["easy", "medium", "hard"];
const LEGACY_DIFFICULTIES = ["easy", "medium", "hard"];
const { normalizeTags, tagsMatchAny } = require("./codingTags");

function getLegacyDifficultyCounts(questionCount, distribution) {
  const exactCounts = DIFFICULTIES.map((difficulty) => ({
    difficulty,
    exact: questionCount * ((distribution[difficulty] || 0) / 100),
  }));
  const counts = exactCounts.map(({ difficulty, exact }) => ({
    difficulty,
    count: Math.floor(exact),
    remainder: exact - Math.floor(exact),
  }));
  let remaining = questionCount - counts.reduce((sum, entry) => sum + entry.count, 0);
  counts.sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index += 1) counts[index].count += 1;
  return Object.fromEntries(counts.map(({ difficulty, count }) => [difficulty, count]));
}

function getConfiguredDifficultyCounts(round) {
  if (round.difficulty_counts && typeof round.difficulty_counts === "object") {
    return Object.fromEntries(DIFFICULTIES.map((difficulty) => [
      difficulty,
      round.difficulty_counts[difficulty] ?? 0,
    ]));
  }

  const distribution = round.difficulty_distribution;
  if (distribution && LEGACY_DIFFICULTIES.some((difficulty) => Number(distribution[difficulty]) > 0)) {
    return getLegacyDifficultyCounts(round.question_count, distribution);
  }

  return null;
}

function isLegacyDifficultyConfiguration(round) {
  return !round.difficulty_counts
    && round.difficulty_distribution
    && LEGACY_DIFFICULTIES.some((difficulty) => Number(round.difficulty_distribution[difficulty]) > 0);
}

function validateRoundSequence(roundSequence, { allowLegacy = true } = {}) {
  if (!Array.isArray(roundSequence) || roundSequence.length === 0) {
    return "At least one round must be configured.";
  }

  const seenTypes = new Set();
  let enabledCount = 0;

  for (const round of roundSequence) {
    if (!round || !["aptitude", "coding", "theory"].includes(round.round_type)) {
      return "Each round must have a valid round type.";
    }
    if (seenTypes.has(round.round_type)) {
      return `Only one ${round.round_type} round can be configured per company.`;
    }
    seenTypes.add(round.round_type);

    const enabled = round.enabled !== false;
    if (!Number.isInteger(round.question_count) || round.question_count < 0) {
      return `${round.round_type}: question count must be a non-negative integer.`;
    }
    if (!Number.isInteger(round.time_limit_seconds) || round.time_limit_seconds <= 0) {
      return `${round.round_type}: duration must be a positive number of seconds.`;
    }
    if (enabled && round.question_count <= 0) {
      return `${round.round_type}: enabled rounds must have at least one question.`;
    }
    if (enabled) enabledCount += 1;

    if (round.included_topics != null && (!Array.isArray(round.included_topics)
        || round.included_topics.some((topic) => typeof topic !== "string"))) {
      return `${round.round_type}: included topics must be a list of names.`;
    }
    if (round.round_type === "coding" && round.included_topics) {
      round.included_topics = normalizeTags(round.included_topics);
    }

    if (round.difficulty_counts && typeof round.difficulty_counts === "object") {
      const values = DIFFICULTIES.map((difficulty) => round.difficulty_counts[difficulty]);
      if (values.some((value) => !Number.isInteger(value) || value < 0)) {
        return `${round.round_type}: difficulty question counts must be non-negative whole numbers.`;
      }
      if (values.reduce((sum, value) => sum + value, 0) !== round.question_count) {
        return `${round.round_type}: Easy, Medium, and Hard question counts must total ${round.question_count}.`;
      }
      continue;
    }

    if (!allowLegacy) {
      return `${round.round_type}: set Easy, Medium, and Hard question counts.`;
    }

    const distribution = round.difficulty_distribution;
    if (!distribution || typeof distribution !== "object") {
      return `${round.round_type}: set Easy, Medium, and Hard question counts.`;
    }
    const values = LEGACY_DIFFICULTIES.map((difficulty) => distribution[difficulty] ?? 0);
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
      return `${round.round_type}: legacy difficulty percentages must be whole numbers from 0 to 100. Review and save this round using question counts.`;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total !== 100) {
      return `${round.round_type}: legacy difficulty percentages must total 100. Review and save this round using question counts.`;
    }
  }

  if (enabledCount === 0) return "Enable at least one round.";
  return null;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function baseRoundFilter(round, roundType, difficulty, questionIds) {
  const filters = [];
  if (questionIds) filters.push({ _id: { $in: questionIds } });
  if (round.category && roundType !== "coding") {
    filters.push({ [roundType === "theory" ? "subject" : "category"]: round.category });
  }
  if (round.difficulty && !difficulty) filters.push({ difficulty: round.difficulty });
  if (difficulty) filters.push({ difficulty: difficulty[0].toUpperCase() + difficulty.slice(1) });
  return filters.length > 1 ? { $and: filters } : filters[0] || {};
}

function matchesRoundTopics(question, round, roundType) {
  const topics = round.included_topics || [];
  if (roundType === "coding") {
    const codingTopics = [...topics, ...(round.category ? [round.category] : [])];
    return tagsMatchAny(question.tags, codingTopics);
  }
  if (!topics.length) return true;
  const field = roundType === "theory" ? "subject" : "category";
  const values = new Set(topics.map((topic) => String(topic).trim().toLowerCase()));
  return values.has(String(question[field] || "").trim().toLowerCase());
}

async function findEligibleQuestions(Bank, round, difficulty, questionIds) {
  const candidates = await Bank.find(baseRoundFilter(round, round.round_type, difficulty, questionIds))
    .select("_id title question_text difficulty category subject tags")
    .lean();
  return candidates.filter((question) => matchesRoundTopics(question, round, round.round_type));
}

function shortageMessage(companyName, roundType, required, available, difficulty) {
  const roundName = roundType.charAt(0).toUpperCase() + roundType.slice(1);
  const needed = required - available;
  const difficultyLabel = difficulty
    ? ` ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`
    : "";
  return `${companyName} ${roundName} round requires ${required}${difficultyLabel} question${required === 1 ? "" : "s"}, but only ${available} eligible question${available === 1 ? " is" : "s are"} available. Add ${needed} question${needed === 1 ? "" : "s"} or reduce the configured count.`;
}

async function explainShortage(Bank, round, companyName, required, available, difficulty, questionIds) {
  const message = shortageMessage(companyName, round.round_type, required, available, difficulty);
  const details = [];
  const matchingWithoutAssignmentFilter = Array.isArray(questionIds)
    ? await findEligibleQuestions(Bank, round, difficulty, undefined)
    : null;

  if (matchingWithoutAssignmentFilter && matchingWithoutAssignmentFilter.length > available) {
    const assignedIds = new Set(questionIds.map(String));
    const excluded = matchingWithoutAssignmentFilter.filter(
      (question) => !assignedIds.has(String(question._id))
    );
    const bankName = `${round.round_type.charAt(0).toUpperCase()}${round.round_type.slice(1)} Question`;
    const roundName = `${round.round_type} round`;
    const examples = excluded.slice(0, 10).map((question) => (
      `${question.title || question.question_text || "Untitled question"} (_id: ${question._id})`
    ));
    const remainder = excluded.length > examples.length
      ? `, and ${excluded.length - examples.length} more`
      : "";
    details.push(
      `${excluded.length} question(s) in the ${bankName} bank match this difficulty and topic selection but are excluded by this company's ${roundName} question assignments: ${examples.join(", ")}${remainder}. Add the exact MongoDB _id(s) to this company's ${roundName} assignments, or remove obsolete/restrictive assignment rows.`
    );

    const existingAssigned = await Bank.find({ _id: { $in: questionIds } })
      .select("_id")
      .lean();
    const existingIds = new Set(existingAssigned.map((question) => String(question._id)));
    const staleIds = [...new Set(questionIds.map(String))].filter((id) => !existingIds.has(id));
    if (staleIds.length) {
      details.push(
        `These assigned ${roundName} question ID(s) do not exist in the ${bankName} bank: ${staleIds.join(", ")}. Replace them with the question records' current MongoDB _id values.`
      );
    }
  }

  const candidatesWithoutTopicFilter = await Bank.find(
    baseRoundFilter(round, round.round_type, difficulty, questionIds)
  ).select("_id title question_text difficulty category subject tags").lean();
  const topicMatches = candidatesWithoutTopicFilter.filter(
    (question) => matchesRoundTopics(question, round, round.round_type)
  );
  if (candidatesWithoutTopicFilter.length > 0 && topicMatches.length === 0) {
    const topics = [...(round.included_topics || []), ...(round.category ? [round.category] : [])];
    const requested = topics.length ? topics.join(", ") : "any topic";
    details.push(
      `There are ${candidatesWithoutTopicFilter.length} ${difficulty ? `${difficulty} ` : ""}${round.round_type} question(s) in the selected bank, but none match the configured topic(s): ${requested}. Add at least one matching tag to a coding question or correct the included topics. Coding topics use OR matching.`
    );
  }

  return details.length ? `${message} ${details.join(" ")}` : message;
}

async function assignQuestions(Bank, round, companyName, questionIds) {
  const selected = [];
  const difficultyCounts = getConfiguredDifficultyCounts(round);

  if (difficultyCounts) {
    for (const difficulty of DIFFICULTIES) {
      const count = difficultyCounts[difficulty];
      if (count === 0) continue;
      const candidates = await findEligibleQuestions(Bank, round, difficulty, questionIds);
      if (candidates.length < count) {
        throw new Error(await explainShortage(
          Bank, round, companyName, count, candidates.length, difficulty, questionIds
        ));
      }
      selected.push(...shuffle(candidates).slice(0, count).map((question) => question._id));
    }
  } else {
    const candidates = await findEligibleQuestions(Bank, round, null, questionIds);
    if (candidates.length < round.question_count) {
      throw new Error(await explainShortage(
        Bank, round, companyName, round.question_count, candidates.length, null, questionIds
      ));
    }
    selected.push(...shuffle(candidates).slice(0, round.question_count).map((question) => question._id));
  }

  const uniqueSelected = [...new Map(selected.map((id) => [String(id), id])).values()];
  if (uniqueSelected.length !== round.question_count) {
    throw new Error(`${companyName} ${round.round_type} round is configured for ${round.question_count} questions, but the difficulty counts select ${uniqueSelected.length}.`);
  }
  return shuffle(uniqueSelected);
}

async function validateRoundAvailability(roundSequence, banks, companyName, questionIdsByType = {}) {
  const errors = [];

  for (const round of roundSequence.filter((item) => item.enabled !== false)) {
    const Bank = banks[round.round_type];
    const difficultyCounts = getConfiguredDifficultyCounts(round);

    if (difficultyCounts) {
      for (const difficulty of DIFFICULTIES) {
        const required = difficultyCounts[difficulty];
        if (required === 0) continue;
        const available = (await findEligibleQuestions(
          Bank, round, difficulty, questionIdsByType[round.round_type]
        )).length;
        if (available < required) {
          errors.push(await explainShortage(
            Bank,
            round,
            companyName,
            required,
            available,
            difficulty,
            questionIdsByType[round.round_type]
          ));
        }
      }
    } else {
      const available = (await findEligibleQuestions(
        Bank, round, null, questionIdsByType[round.round_type]
      )).length;
      if (available < round.question_count) {
        errors.push(await explainShortage(
          Bank,
          round,
          companyName,
          round.question_count,
          available,
          null,
          questionIdsByType[round.round_type]
        ));
      }
    }
  }

  return errors;
}

module.exports = {
  assignQuestions,
  getConfiguredDifficultyCounts,
  getLegacyDifficultyCounts,
  isLegacyDifficultyConfiguration,
  normalizeTags,
  validateRoundSequence,
  validateRoundAvailability,
};
