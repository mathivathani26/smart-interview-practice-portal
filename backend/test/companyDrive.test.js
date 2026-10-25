const test = require("node:test");
const assert = require("node:assert/strict");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const Session = require("../models/Session");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
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

test("legacy driveId selection is rejected instead of exposing duplicate drive choices", async () => {
  const res = createResponse();
  await routeHandler(sessionsRouter, "post", "/start")({
    userId: "student-id",
    body: { mode: "mock_drive", driveId: "legacy-drive-id" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Select a company/);
});
