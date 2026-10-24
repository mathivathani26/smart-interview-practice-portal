const test = require("node:test");
const assert = require("node:assert/strict");
const Company = require("../models/Company");
const MockDrive = require("../models/MockDrive");
const CodingQuestion = require("../models/CodingQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const adminRouter = require("../routes/admin");

function handlerFor(method, path) {
  const layer = adminRouter.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);
  return layer.route.stack[0].handle;
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

function validRoundSequence() {
  return [{
    round_type: "coding",
    enabled: true,
    question_count: 1,
    time_limit_seconds: 600,
    included_topics: ["array"],
    difficulty_distribution: { easy: 0, medium: 0, hard: 0 },
  }];
}

test("drive model has independent company-scoped identity and publish status", () => {
  assert.deepEqual(MockDrive.schema.path("status").enumValues, ["draft", "published"]);
  assert.ok(MockDrive.schema.indexes().some(([fields, options]) => (
    fields.company === 1 && fields.name === 1 && options.unique === true
  )));
});

test("new drive is stored as an independent draft for its company", async (t) => {
  const company = { _id: "company-id", name: "Test Co" };
  const created = { _id: "drive-id", company: company._id, name: "Advanced", status: "draft" };
  t.mock.method(Company, "findById", async () => company);
  t.mock.method(MockDrive, "create", async (data) => {
    assert.equal(data.company, company._id);
    assert.equal(data.name, "Advanced");
    assert.equal(data.status, "draft");
    assert.deepEqual(data.round_sequence, validRoundSequence());
    return created;
  });

  const res = createResponse();
  await handlerFor("post", "/companies/:id/drives")({
    params: { id: company._id },
    body: { name: " Advanced ", round_sequence: validRoundSequence() },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body._id, "drive-id");
});

test("publishes a drive when all configured question pools are available", async (t) => {
  const drive = {
    company: { name: "Test Co" },
    status: "draft",
    round_sequence: validRoundSequence().map((round) => ({
      ...round,
      toObject() {
        return round;
      },
    })),
    async save() {
      return this;
    },
  };
  t.mock.method(MockDrive, "findById", () => ({
    populate: async () => drive,
  }));
  t.mock.method(CodingQuestion, "countDocuments", async () => 1);
  t.mock.method(CompanyQuestionAssignment, "find", () => ({
    select() { return this; },
    lean: async () => [],
  }));

  const res = createResponse();
  await handlerFor("put", "/drives/:id/status")({
    params: { id: "drive-id" },
    body: { status: "published" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(drive.status, "published");
  assert.equal(res.body.status, "published");
});

test("publishing a drive is blocked while its configured question pool is insufficient", async (t) => {
  const drive = {
    company: { name: "Test Co" },
    status: "draft",
    round_sequence: validRoundSequence().map((round) => ({
      ...round,
      toObject() {
        return round;
      },
    })),
    async save() {
      throw new Error("An invalid drive must not be saved");
    },
  };
  t.mock.method(MockDrive, "findById", () => ({
    populate: async () => drive,
  }));
  t.mock.method(CodingQuestion, "countDocuments", async () => 0);
  t.mock.method(CompanyQuestionAssignment, "find", () => ({
    select() { return this; },
    lean: async () => [],
  }));

  const res = createResponse();
  await handlerFor("put", "/drives/:id/status")({
    params: { id: "drive-id" },
    body: { status: "published" },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /Coding Round: 1 question required, but only 0 eligible questions are available/);
  assert.equal(drive.status, "draft");
});
