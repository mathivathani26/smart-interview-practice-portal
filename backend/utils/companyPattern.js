const DIFFICULTIES = ["easy", "medium", "hard"];

function validateRoundSequence(roundSequence) {
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

    const distribution = round.difficulty_distribution || {};
    const values = DIFFICULTIES.map((difficulty) => distribution[difficulty] ?? 0);
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
      return `${round.round_type}: difficulty percentages must be whole numbers from 0 to 100.`;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total !== 0 && total !== 100) {
      return `${round.round_type}: difficulty percentages must total 100.`;
    }
  }

  if (enabledCount === 0) return "Enable at least one round.";
  return null;
}

function getDifficultyCounts(questionCount, distribution) {
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
  return counts;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function roundFilter(round, roundType, difficulty, questionIds) {
  const filters = [];
  if (questionIds) filters.push({ _id: { $in: questionIds } });
  if (round.category) {
    filters.push({ [roundType === "theory" ? "subject" : "category"]: round.category });
  }
  if (round.included_topics && round.included_topics.length > 0) {
    const field = roundType === "theory" ? "subject" : roundType === "coding" ? "tags" : "category";
    filters.push({ [field]: { $in: round.included_topics } });
  }
  if (round.difficulty) filters.push({ difficulty: round.difficulty });
  if (difficulty) filters.push({ difficulty: difficulty[0].toUpperCase() + difficulty.slice(1) });
  return filters.length > 1 ? { $and: filters } : filters[0] || {};
}

async function assignQuestions(Bank, round, companyName, questionIds) {
  const roundName = round.round_type.charAt(0).toUpperCase() + round.round_type.slice(1);
  const distribution = round.difficulty_distribution || {};
  const hasDistribution = DIFFICULTIES.some((difficulty) => distribution[difficulty] > 0);
  const selected = [];

  if (hasDistribution) {
    const difficultyCounts = getDifficultyCounts(round.question_count, distribution);
    for (const { difficulty, count } of difficultyCounts) {
      if (count === 0) continue;
      const candidates = await Bank.find(roundFilter(round, round.round_type, difficulty, questionIds)).select("_id").lean();
      if (candidates.length < count) {
        const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
        throw new Error(`${companyName}: ${roundName} requires ${count} ${label} question${count === 1 ? "" : "s"}, but only ${candidates.length} eligible question${candidates.length === 1 ? " is" : "s are"} available.`);
      }
      selected.push(...shuffle(candidates).slice(0, count).map((question) => question._id));
    }
  } else {
    const candidates = await Bank.find(roundFilter(round, round.round_type, null, questionIds)).select("_id").lean();
    if (candidates.length < round.question_count) {
      throw new Error(`${companyName}: ${roundName} requires ${round.question_count} question${round.question_count === 1 ? "" : "s"}, but only ${candidates.length} eligible question${candidates.length === 1 ? " is" : "s are"} available.`);
    }
    selected.push(...shuffle(candidates).slice(0, round.question_count).map((question) => question._id));
  }

  return shuffle(selected);
}

async function validateRoundAvailability(roundSequence, banks, companyName, questionIdsByType = {}) {
  const errors = [];

  for (const round of roundSequence.filter((item) => item.enabled !== false)) {
    const Bank = banks[round.round_type];
    const roundName = round.round_type.charAt(0).toUpperCase() + round.round_type.slice(1);
    const distribution = round.difficulty_distribution || {};
    const hasDistribution = DIFFICULTIES.some((difficulty) => distribution[difficulty] > 0);

    if (hasDistribution) {
      const difficultyCounts = getDifficultyCounts(round.question_count, distribution);
      for (const { difficulty, count } of difficultyCounts) {
        if (count === 0) continue;
        const available = await Bank.countDocuments(roundFilter(
          round, round.round_type, difficulty, questionIdsByType[round.round_type]
        ));
        if (available < count) {
          const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
          const shortage = count - available;
          errors.push(
            `${companyName} ${roundName} Round: ${count} ${label} question${count === 1 ? "" : "s"} required, but only ${available} eligible question${available === 1 ? " is" : "s are"} available. Add ${shortage} more or adjust the difficulty allocation.`
          );
        }
      }
    } else {
      const available = await Bank.countDocuments(
        roundFilter(round, round.round_type, null, questionIdsByType[round.round_type])
      );
      if (available < round.question_count) {
        const shortage = round.question_count - available;
        errors.push(
          `${companyName} ${roundName} Round: ${round.question_count} question${round.question_count === 1 ? "" : "s"} required, but only ${available} eligible question${available === 1 ? " is" : "s are"} available. Add ${shortage} more question${shortage === 1 ? "" : "s"} or reduce the configured count.`
        );
      }
    }
  }

  return errors;
}

module.exports = { assignQuestions, validateRoundSequence, validateRoundAvailability };
