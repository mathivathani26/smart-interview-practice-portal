const test = require("node:test");
const assert = require("node:assert/strict");
const { assignQuestions, validateRoundSequence } = require("../utils/companyPattern");

function matches(question, filter) {
  if (filter.$and) return filter.$and.every((part) => matches(question, part));
  return Object.entries(filter).every(([field, condition]) => {
    if (condition && condition.$in) {
      const value = question[field];
      return Array.isArray(value)
        ? value.some((item) => condition.$in.includes(item))
        : condition.$in.includes(value);
    }
    return question[field] === condition;
  });
}

function questionBank(questions) {
  return {
    find(filter) {
      return {
        select() { return this; },
        lean: async () => questions.filter((question) => matches(question, filter)).map(({ _id }) => ({ _id })),
      };
    },
  };
}

test("validates enabled rounds, disabled rounds, durations, and distributions", () => {
  const valid = [
    { round_type: "aptitude", enabled: true, question_count: 2, time_limit_seconds: 300 },
    { round_type: "coding", enabled: false, question_count: 0, time_limit_seconds: 600 },
  ];
  assert.equal(validateRoundSequence(valid), null);
  assert.match(validateRoundSequence([{ ...valid[0], question_count: 0 }]), /at least one question/);
  assert.match(validateRoundSequence([{ ...valid[0], time_limit_seconds: 0 }]), /duration must be a positive/);
  assert.match(validateRoundSequence([{ ...valid[0], difficulty_distribution: { easy: 40, medium: 40, hard: 0 } }]), /must total 100/);
  assert.match(validateRoundSequence([{ ...valid[0], enabled: false }, { ...valid[1], enabled: false }]), /Enable at least one round/);
});

test("assigns a distinct topic-filtered set honoring the requested difficulty mix", async () => {
  const questions = [
    { _id: "e1", category: "quantitative", difficulty: "Easy" },
    { _id: "e2", category: "quantitative", difficulty: "Easy" },
    { _id: "e3", category: "quantitative", difficulty: "Easy" },
    { _id: "m1", category: "quantitative", difficulty: "Medium" },
    { _id: "m2", category: "quantitative", difficulty: "Medium" },
    { _id: "h1", category: "quantitative", difficulty: "Hard" },
    { _id: "h2", category: "quantitative", difficulty: "Hard" },
    { _id: "other", category: "verbal", difficulty: "Easy" },
  ];
  const assigned = await assignQuestions(questionBank(questions), {
    round_type: "aptitude",
    question_count: 4,
    included_topics: ["quantitative"],
    difficulty_distribution: { easy: 50, medium: 25, hard: 25 },
  }, "Test Co");

  assert.equal(assigned.length, 4);
  assert.equal(new Set(assigned).size, 4);
  const selected = assigned.map((id) => questions.find((question) => question._id === id));
  assert.deepEqual(selected.reduce((counts, question) => {
    counts[question.difficulty] = (counts[question.difficulty] || 0) + 1;
    return counts;
  }, {}), { Easy: 2, Medium: 1, Hard: 1 });
  assert.ok(selected.every((question) => question.category === "quantitative"));
});

test("reports when the requested eligible question count cannot be fulfilled", async () => {
  await assert.rejects(
    assignQuestions(questionBank([{ _id: "only", subject: "DBMS" }]), {
      round_type: "theory",
      question_count: 2,
      included_topics: ["DBMS"],
      difficulty_distribution: { easy: 0, medium: 0, hard: 0 },
    }, "Test Co"),
    /Test Co: Theory requires 2 questions, but only 1 eligible question is available/
  );
});

test("reports a missing difficulty pool instead of silently changing the requested mix", async () => {
  await assert.rejects(
    assignQuestions(questionBank([{ _id: "easy", subject: "DBMS", difficulty: "Easy" }]), {
      round_type: "theory",
      question_count: 2,
      included_topics: ["DBMS"],
      difficulty_distribution: { easy: 50, medium: 0, hard: 50 },
    }, "Test Co"),
    /Test Co: Theory requires 1 Hard question, but only 0 eligible questions are available/
  );
});
