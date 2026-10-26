const test = require("node:test");
const assert = require("node:assert/strict");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const CodingQuestion = require("../models/CodingQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const adminRouter = require("../routes/admin");
const { normalizeTags } = require("../utils/codingTags");

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

function queryReturning(value) {
  return {
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    lean: async () => value,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

test("normalizes coding tags on create and edit while preserving OR-ready tag arrays", async (t) => {
  assert.deepEqual(normalizeTags([" Arrays ", "ARRAY", "binary   search", "strings"]), [
    "array", "binary search", "string",
  ]);
  t.mock.method(CodingQuestion, "create", async (data) => data);
  const response = createResponse();
  await handlerFor("post", "/questions/coding")({
    body: {
      title: "Test problem",
      description: "Problem details",
      difficulty: "Easy",
      tags: [" Arrays ", "ARRAY", "binary   search"],
    },
  }, response);
  assert.deepEqual(response.body.tags, ["array", "binary search"]);
});

test("normalizes legacy plural and case differences in coding question updates", async (t) => {
  t.mock.method(CompanyQuestionAssignment, "find", () => ({
    select() { return this; },
    lean: async () => [],
  }));
  t.mock.method(CodingQuestion, "findByIdAndUpdate", async (id, update) => {
    assert.equal(id, "question-id");
    return update;
  });
  const response = createResponse();
  await handlerFor("put", "/questions/coding/:id")({
    params: { id: "question-id" },
    body: { tags: "Trees,  GRAPHs ; arrays" },
  }, response);
  assert.deepEqual(response.body.tags, ["tree", "graph", "array"]);
});

test("rejects a coding question edit that would invalidate an assigned company's round", async (t) => {
  const company = { _id: "company-id", name: "Test Co" };
  const assignedQuestion = {
    _id: "question-id",
    round_type: "coding",
    question: "question-id",
    company: company._id,
  };
  const pattern = {
    round_sequence: [{
      round_type: "coding",
      enabled: true,
      question_count: 1,
      time_limit_seconds: 300,
      included_topics: ["array"],
      difficulty_counts: { easy: 1, medium: 0, hard: 0 },
    }],
  };
  const updatedQuestion = {
    _id: "question-id",
    difficulty: "Easy",
    tags: ["graph"],
  };
  const currentQuestion = {
    _id: "question-id",
    difficulty: "Easy",
    tags: ["array"],
    toObject() {
      return { _id: this._id, difficulty: this.difficulty, tags: this.tags };
    },
  };
  t.mock.method(CompanyQuestionAssignment, "find", (filter) => queryReturning(
    filter.company ? [assignedQuestion] : [assignedQuestion]
  ));
  t.mock.method(CodingQuestion, "findById", () => queryReturning(currentQuestion));
  let saved = false;
  t.mock.method(CodingQuestion, "findOneAndUpdate", async () => {
    saved = true;
    return updatedQuestion;
  });
  t.mock.method(CodingQuestion, "find", () => queryReturning([updatedQuestion]));
  t.mock.method(Company, "findById", () => queryReturning(company));
  t.mock.method(CompanyPattern, "findOne", () => queryReturning(pattern));
  t.mock.method(MockDrive, "find", () => queryReturning([]));

  const response = createResponse();
  await handlerFor("put", "/questions/coding/:id")({
    params: { id: "question-id" },
    body: { tags: ["graph"] },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /Test Co Coding round requires 1 Easy question/);
  assert.match(response.body.message, /do not match the configured topic/);
  assert.equal(saved, false);
});

test("deleting a coding question removes only its company assignment references", async (t) => {
  const question = { _id: "coding-question-id" };
  let deletedAssignments;
  t.mock.method(CompanyQuestionAssignment, "find", () => ({
    select() { return this; },
    lean: async () => [],
  }));
  t.mock.method(CodingQuestion, "findByIdAndDelete", async () => question);
  t.mock.method(CompanyQuestionAssignment, "deleteMany", async (filter) => {
    deletedAssignments = filter;
    return { deletedCount: 1 };
  });

  const response = createResponse();
  await handlerFor("delete", "/questions/coding/:id")({
    params: { id: question._id },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(deletedAssignments, {
    round_type: "coding",
    question: question._id,
  });
  assert.deepEqual(response.body, { deleted: true });
});

test("prevents deleting the last eligible coding question for a configured company", async (t) => {
  const question = { _id: "coding-question-id" };
  const assignment = {
    _id: "assignment-id",
    company: "company-id",
    round_type: "coding",
    question: question._id,
  };
  const pattern = {
    round_sequence: [{
      round_type: "coding",
      enabled: true,
      question_count: 1,
      time_limit_seconds: 300,
      included_topics: ["array"],
      difficulty_counts: { easy: 1, medium: 0, hard: 0 },
    }],
  };
  let questionDeleted = false;
  t.mock.method(CompanyQuestionAssignment, "find", () => queryReturning([assignment]));
  t.mock.method(Company, "findById", () => queryReturning({ _id: "company-id", name: "Test Co" }));
  t.mock.method(CompanyPattern, "findOne", () => queryReturning(pattern));
  t.mock.method(MockDrive, "find", () => queryReturning([]));
  t.mock.method(CodingQuestion, "find", () => queryReturning([]));
  t.mock.method(CodingQuestion, "findByIdAndDelete", async () => {
    questionDeleted = true;
    return question;
  });

  const response = createResponse();
  await handlerFor("delete", "/questions/coding/:id")({
    params: { id: question._id },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /Test Co Coding round requires 1 Easy question/);
  assert.equal(questionDeleted, false);
});
