const test = require("node:test");
const assert = require("node:assert/strict");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const CodingQuestion = require("../models/CodingQuestion");
const adminRouter = require("../routes/admin");
const {
  assignQuestions,
  getConfiguredDifficultyCounts,
  validateRoundSequence,
  validateRoundAvailability,
} = require("../utils/companyPattern");
const { normalizeTags } = require("../utils/codingTags");

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
        lean: async () => questions.filter((question) => matches(question, filter)),
      };
    },
  };
}

function handlerFor(method, path) {
  const layer = adminRouter.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function countRound(overrides = {}) {
  return {
    round_type: "coding",
    enabled: true,
    question_count: 3,
    time_limit_seconds: 300,
    included_topics: ["array"],
    difficulty_counts: { easy: 1, medium: 1, hard: 1 },
    ...overrides,
  };
}

test("validates exact non-negative integer difficulty counts and one round per type", () => {
  const valid = [
    countRound({ round_type: "aptitude" }),
    countRound({ round_type: "theory", enabled: false, question_count: 0, difficulty_counts: { easy: 0, medium: 0, hard: 0 } }),
  ];
  assert.equal(validateRoundSequence(valid, { allowLegacy: false }), null);
  assert.match(validateRoundSequence([countRound({ difficulty_counts: { easy: 1, medium: 1, hard: 0 } })], { allowLegacy: false }), /must total 3/);
  assert.match(validateRoundSequence([countRound({ difficulty_counts: { easy: -1, medium: 2, hard: 2 } })], { allowLegacy: false }), /non-negative whole numbers/);
  assert.match(validateRoundSequence([countRound({ difficulty_counts: { easy: 1.5, medium: 1, hard: 0.5 } })], { allowLegacy: false }), /non-negative whole numbers/);
  assert.match(validateRoundSequence([countRound({ difficulty_counts: { easy: 1, medium: 2 } })], { allowLegacy: false }), /non-negative whole numbers/);
  assert.match(validateRoundSequence([countRound(), countRound()]), /Only one coding round/);
  assert.match(validateRoundSequence([{ ...countRound(), enabled: false }, { ...countRound({ round_type: "aptitude" }), enabled: false }]), /Enable at least one round/);
});

test("rejects active rounds without a complete difficulty allocation", () => {
  assert.match(
    validateRoundSequence([countRound({
      difficulty_counts: undefined,
      difficulty_distribution: undefined,
    })]),
    /set Easy, Medium, and Hard question counts/
  );
  assert.match(
    validateRoundSequence([countRound({
      difficulty_counts: undefined,
      difficulty_distribution: { easy: 0, medium: 0, hard: 0 },
    })]),
    /legacy difficulty percentages must total 100/
  );
});

test("legacy percentages remain explicitly legacy and convert deterministically without rewriting them", () => {
  const legacy = {
    ...countRound({ question_count: 5 }),
    difficulty_counts: undefined,
    difficulty_distribution: { easy: 40, medium: 40, hard: 20 },
  };
  assert.equal(validateRoundSequence([legacy]), null);
  assert.match(validateRoundSequence([legacy], { allowLegacy: false }), /set Easy, Medium, and Hard question counts/);
  assert.deepEqual(getConfiguredDifficultyCounts(legacy), { easy: 2, medium: 2, hard: 1 });
  assert.deepEqual(legacy.difficulty_distribution, { easy: 40, medium: 40, hard: 20 });
});

test("assigns exact counts from eligible, company-assigned topics without duplicates", async () => {
  const questions = [
    { _id: "e1", tags: ["arrays"], difficulty: "Easy" },
    { _id: "e2", tags: ["arrays"], difficulty: "Easy" },
    { _id: "m1", tags: ["string"], difficulty: "Medium" },
    { _id: "h1", tags: ["dynamic programming"], difficulty: "Hard" },
    { _id: "unassigned", tags: ["array"], difficulty: "Hard" },
    { _id: "wrong-tag", tags: ["graphs"], difficulty: "Easy" },
  ];
  const assigned = await assignQuestions(questionBank(questions), countRound({
    included_topics: ["array", "string", "dynamic programming"],
  }), "Test Co", ["e1", "m1", "h1", "wrong-tag"]);
  assert.equal(assigned.length, 3);
  assert.equal(new Set(assigned).size, 3);
  assert.deepEqual(assigned.sort(), ["e1", "h1", "m1"]);
});

test("assigns exactly two eligible Medium questions for Two Sum and Valid Parentheses topics", async () => {
  const assigned = await assignQuestions(questionBank([
    { _id: "two-sum-id", title: "Two Sum", tags: ["array", "hashing"], difficulty: "Medium" },
    { _id: "valid-parentheses-id", title: "Valid Parentheses", tags: ["stack", "string"], difficulty: "Medium" },
    { _id: "unrelated-id", title: "Graph Traversal", tags: ["graph"], difficulty: "Medium" },
    { _id: "wrong-difficulty-id", title: "Easy Array", tags: ["array"], difficulty: "Easy" },
  ]), countRound({
    question_count: 2,
    included_topics: ["ARRAYS", "hashing", "STACK", "strings"],
    difficulty_counts: { easy: 0, medium: 2, hard: 0 },
  }), "Test Co");

  assert.equal(assigned.length, 2);
  assert.equal(new Set(assigned).size, 2);
  assert.deepEqual(assigned.sort(), ["two-sum-id", "valid-parentheses-id"]);
});

test("coding tag matching normalizes whitespace, case, and common plurals with OR semantics", async () => {
  assert.deepEqual(normalizeTags([" Arrays ", "ARRAY", " binary   search ", "strings", "string"]), ["array", "binary search", "string"]);
  const questions = [
    { _id: "array-question", tags: ["ARRAYS"], difficulty: "Easy" },
    { _id: "tree-question", tags: ["Trees"], difficulty: "Easy" },
    { _id: "unrelated", tags: ["graph"], difficulty: "Easy" },
  ];
  const round = countRound({
    question_count: 2,
    difficulty_counts: { easy: 2, medium: 0, hard: 0 },
    included_topics: ["array", "tree"],
  });
  const assigned = await assignQuestions(questionBank(questions), round, "Test Co");
  assert.deepEqual(assigned.sort(), ["array-question", "tree-question"]);
});

test("reports insufficient matching questions instead of falling back to unrelated coding questions", async () => {
  const round = countRound({
    question_count: 2,
    difficulty_counts: { easy: 2, medium: 0, hard: 0 },
    included_topics: ["array"],
  });
  await assert.rejects(
    assignQuestions(questionBank([
      { _id: "wrong-tag", tags: ["graph"], difficulty: "Easy" },
    ]), round, "Test Co"),
    /Test Co Coding round requires 2 Easy questions, but only 0 eligible questions are available/
  );
});

test("explains when company assignment IDs exclude matching bank questions and identifies stale IDs", async () => {
  const questions = [
    { _id: "two-sum-current-id", title: "Two Sum", tags: ["array", "hashing"], difficulty: "Medium" },
    { _id: "parentheses-current-id", title: "Valid Parentheses", tags: ["stack", "string"], difficulty: "Medium" },
  ];
  const errors = await validateRoundAvailability([countRound({
    question_count: 2,
    included_topics: ["array", "stack"],
    difficulty_counts: { easy: 0, medium: 2, hard: 0 },
  })], {
    coding: questionBank(questions),
  }, "Test Co", { coding: ["stale-id"] });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /excluded by this company's coding round question assignments/);
  assert.match(errors[0], /Two Sum \(_id:/);
  assert.match(errors[0], /Valid Parentheses/);
  assert.match(errors[0], /stale-id/);
  assert.match(errors[0], /current MongoDB _id values/);
});

test("Admin cannot publish a round with an insufficient eligible question inventory", async (t) => {
  const company = { _id: "company-id", name: "Test Co" };
  const roundSequence = [countRound({
    question_count: 2,
    included_topics: ["array"],
    difficulty_counts: { easy: 0, medium: 2, hard: 0 },
  })];
  let saved = false;
  t.mock.method(Company, "findById", async () => company);
  t.mock.method(CompanyQuestionAssignment, "find", () => ({
    select() { return this; },
    lean: async () => [],
  }));
  t.mock.method(CodingQuestion, "find", () => ({
    select() { return this; },
    lean: async () => [
      { _id: "one-medium", title: "One Medium", tags: ["array"], difficulty: "Medium" },
    ],
  }));
  t.mock.method(CompanyPattern, "findOneAndUpdate", async () => {
    saved = true;
    return {};
  });

  const response = createResponse();
  await handlerFor("put", "/companies/:id/pattern")({
    params: { id: company._id },
    body: { round_sequence: roundSequence },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /requires 2 Medium questions, but only 1 eligible question is available/);
  assert.equal(saved, false);
});

test("validates eligible question inventory by exact difficulty and reports shortage", async () => {
  const errors = await validateRoundAvailability([countRound({
    difficulty_counts: { easy: 2, medium: 1, hard: 0 },
  })], {
    coding: questionBank([
      { _id: "e1", tags: ["array"], difficulty: "Easy" },
      { _id: "m1", tags: ["array"], difficulty: "Medium" },
    ]),
  }, "Test Co");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /requires 2 Easy questions, but only 1 eligible question is available/);
});

test("applies category and company assignment filters before availability counts", async () => {
  const errors = await validateRoundAvailability([{
    round_type: "aptitude",
    question_count: 2,
    included_topics: ["quantitative"],
    difficulty_counts: { easy: 2, medium: 0, hard: 0 },
  }], {
    aptitude: questionBank([
      { _id: "assigned", category: "quantitative", difficulty: "Easy" },
      { _id: "unassigned", category: "quantitative", difficulty: "Easy" },
      { _id: "other-category", category: "verbal", difficulty: "Easy" },
    ]),
  }, "Test Co", { aptitude: ["assigned"] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /requires 2 Easy questions, but only 1 eligible question is available/);
});
