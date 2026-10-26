const test = require("node:test");
const assert = require("node:assert/strict");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const Session = require("../models/Session");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const RoundAttempt = require("../models/RoundAttempt");
const companiesRouter = require("../routes/companies");
const sessionsRouter = require("../routes/sessions");

const companyId = "507f1f77bcf86cd799439011";

function routeHandler(router, method, path) {
  const layer = router.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);
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

function queryReturning(items) {
  return {
    sort: async () => items,
    select() { return this; },
    lean: async () => items,
  };
}

test("student company list exposes only one canonical drive for legacy duplicates", async (t) => {
  const company = { _id: companyId, name: "Test Co", description: "Practice" };
  const round = {
    round_type: "aptitude",
    question_count: 1,
    time_limit_seconds: 300,
    difficulty_counts: { easy: 1, medium: 0, hard: 0 },
    included_topics: [],
  };
  const legacyDrives = [
    { _id: "later", name: "Later", status: "published", createdAt: new Date("2024-02-01"), round_sequence: [round] },
    { _id: "earlier", name: "Earlier", status: "published", createdAt: new Date("2024-01-01"), round_sequence: [round] },
  ];
  t.mock.method(Company, "find", () => ({ sort: async () => [company] }));
  t.mock.method(CompanyPattern, "find", async () => []);
  t.mock.method(MockDrive, "find", () => ({ sort: async () => legacyDrives }));
  t.mock.method(CompanyQuestionAssignment, "find", () => queryReturning([]));
  t.mock.method(AptitudeQuestion, "find", () => queryReturning([
    { _id: "aptitude-id", difficulty: "Easy", category: "quantitative" },
  ]));

  const res = createResponse();
  await routeHandler(companiesRouter, "get", "/")({ userId: "student-id" }, res);

  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].has_pattern, true);
  assert.equal(res.body[0].round_sequence.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body[0], "drives"), false);
});

test("Mock Drive start requires companyId and snapshots the exact count-based assignment", async (t) => {
  const company = { _id: companyId, name: "Test Co" };
  const round = {
    round_type: "coding",
    question_count: 1,
    time_limit_seconds: 600,
    included_topics: ["array"],
    difficulty_counts: { easy: 1, medium: 0, hard: 0 },
  };
  const createdSession = { _id: "session-id" };
  t.mock.method(Company, "findById", async () => company);
  t.mock.method(CompanyPattern, "findOne", async () => ({ round_sequence: [round] }));
  t.mock.method(CompanyQuestionAssignment, "find", () => queryReturning([]));
  t.mock.method(CodingQuestion, "find", () => queryReturning([
    { _id: "coding-id", difficulty: "Easy", tags: ["arrays"] },
  ]));
  t.mock.method(Session, "create", async (data) => {
    assert.equal(data.company, companyId);
    assert.equal(data.mock_drive, null);
    assert.deepEqual(data.drive_rounds[0].question_ids, ["coding-id"]);
    assert.deepEqual(data.drive_rounds[0].difficulty_counts, round.difficulty_counts);
    return createdSession;
  });

  const res = createResponse();
  await routeHandler(sessionsRouter, "post", "/start")({
    userId: "student-id",
    body: { mode: "mock_drive", companyId },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.drive.name, "General Practice Drive");
  assert.deepEqual(res.body.round_sequence[0].difficulty_counts, round.difficulty_counts);
});

test("student coding round receives two configured questions and their safe test cases", async (t) => {
  const company = { _id: companyId, name: "Test Co" };
  const round = {
    round_type: "coding",
    question_count: 2,
    time_limit_seconds: 600,
    included_topics: ["array", "hashing", "stack", "string"],
    difficulty_counts: { easy: 0, medium: 2, hard: 0 },
  };
  const questions = [
    {
      _id: "507f1f77bcf86cd799439021",
      title: "Two Sum",
      description: "Find two values that add to the target.",
      difficulty: "Medium",
      tags: ["array", "hashing"],
      test_cases: [
        { input: "2 7 9", expected_output: "0 1", hidden: false },
        { input: "hidden case", expected_output: "hidden answer", hidden: true },
      ],
    },
    {
      _id: "507f1f77bcf86cd799439022",
      title: "Valid Parentheses",
      description: "Check whether the brackets are valid.",
      difficulty: "Medium",
      tags: ["stack", "string"],
      test_cases: [{ input: "()", expected_output: "true", hidden: false }],
    },
    {
      _id: "507f1f77bcf86cd799439023",
      title: "Graph Traversal",
      description: "An unrelated problem.",
      difficulty: "Medium",
      tags: ["graph"],
      test_cases: [{ input: "", expected_output: "", hidden: false }],
    },
  ];
  let savedSession;
  t.mock.method(Company, "findById", async () => company);
  t.mock.method(CompanyPattern, "findOne", async () => ({ round_sequence: [round] }));
  t.mock.method(CompanyQuestionAssignment, "find", () => queryReturning([]));
  t.mock.method(CodingQuestion, "find", (filter) => queryReturning(
    questions.filter((question) => !filter.difficulty || question.difficulty === filter.difficulty)
  ));
  t.mock.method(Session, "create", async (data) => {
    savedSession = {
      _id: "session-id",
      user: "student-id",
      mode: "mock_drive",
      completed_at: null,
      drive_rounds: data.drive_rounds,
    };
    return savedSession;
  });
  t.mock.method(Session, "findOne", async () => savedSession);
  t.mock.method(RoundAttempt, "countDocuments", async () => 0);
  t.mock.method(CodingQuestion, "findById", async (id) => {
    const question = questions.find((item) => item._id === id);
    return question && { toObject: () => ({ ...question }) };
  });

  const startResponse = createResponse();
  await routeHandler(sessionsRouter, "post", "/start")({
    userId: "student-id",
    body: { mode: "mock_drive", companyId },
  }, startResponse);

  const assignedIds = savedSession.drive_rounds[0].question_ids;
  assert.equal(startResponse.statusCode, 201);
  assert.equal(assignedIds.length, 2);
  assert.equal(new Set(assignedIds.map(String)).size, 2);
  assert.deepEqual(new Set(assignedIds.map(String)), new Set(questions.slice(0, 2).map((question) => question._id)));

  const nextQuestionResponse = createResponse();
  await routeHandler(sessionsRouter, "get", "/:id/next-question")({
    params: { id: "session-id" },
    query: { roundType: "coding", questionIndex: "0" },
    userId: "student-id",
  }, nextQuestionResponse);

  assert.equal(nextQuestionResponse.statusCode, 200);
  const firstAssignedQuestion = questions.find(
    (question) => question._id === assignedIds[0]
  );
  assert.equal(nextQuestionResponse.body._id, assignedIds[0]);
  assert.equal(nextQuestionResponse.body.title, firstAssignedQuestion.title);
  assert.deepEqual(
    nextQuestionResponse.body.test_cases,
    firstAssignedQuestion.test_cases.map((testCase) => (
      testCase.hidden ? { hidden: true } : testCase
    ))
  );
});

test("legacy driveId selection is rejected instead of exposing duplicate drive choices", async () => {
  const res = createResponse();
  await routeHandler(sessionsRouter, "post", "/start")({
    userId: "student-id",
    body: { mode: "mock_drive", driveId: "legacy-drive-id" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Select a company/);
});
