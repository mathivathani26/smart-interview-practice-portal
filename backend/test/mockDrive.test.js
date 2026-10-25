const test = require("node:test");
const assert = require("node:assert/strict");
const MockDrive = require("../models/MockDrive");
const CompanyPattern = require("../models/CompanyPattern");
const Company = require("../models/Company");
const adminRouter = require("../routes/admin");
const { selectCanonicalDriveConfig } = require("../utils/canonicalDriveConfig");

test("legacy MockDrive records remain readable but cannot create independent published choices", () => {
  assert.deepEqual(MockDrive.schema.path("status").enumValues, ["draft", "published"]);
  assert.ok(MockDrive.schema.indexes().some(([fields, options]) => (
    fields.company === 1 && fields.name === 1 && options.unique === true
  )));
  assert.equal(adminRouter.stack.some((layer) => (
    layer.route && /\/drives/.test(layer.route.path)
  )), false);
});

test("CompanyPattern stores explicit question counts while retaining legacy percentage fields", () => {
  const roundSchema = CompanyPattern.schema.path("round_sequence").schema;
  assert.ok(roundSchema.path("difficulty_counts.easy"));
  assert.ok(roundSchema.path("difficulty_distribution.easy"));
});

test("legacy duplicates select one deterministic canonical config without deleting records", () => {
  const legacy = [
    { _id: "later", name: "Later", status: "published", round_sequence: [{ round_type: "coding" }], createdAt: new Date("2024-02-01") },
    { _id: "draft", name: "Draft", status: "draft", round_sequence: [{ round_type: "theory" }], createdAt: new Date("2024-01-01") },
    { _id: "earlier", name: "Earlier", status: "published", round_sequence: [{ round_type: "aptitude" }], createdAt: new Date("2024-01-02") },
  ];
  const selected = selectCanonicalDriveConfig(null, legacy, { includeDraft: true });
  assert.equal(selected.legacy_drive_name, "Earlier");
  assert.equal(selected.legacy_drive_count, 3);
  assert.deepEqual(selected.round_sequence, legacy[2].round_sequence);
  assert.equal(legacy.length, 3);
});

test("company pattern takes precedence over immutable legacy drive records", () => {
  const pattern = { round_sequence: [{ round_type: "theory", question_count: 1 }] };
  const selected = selectCanonicalDriveConfig(pattern, [
    { status: "published", round_sequence: [{ round_type: "coding" }] },
  ]);
  assert.equal(selected.legacy, false);
  assert.deepEqual(selected.round_sequence, pattern.round_sequence);
  assert.equal(selected.legacy_drive_count, 1);
});

test("Admin rejects percentage-only or mismatched counts before saving a company drive", async (t) => {
  t.mock.method(Company, "findById", async () => ({ _id: "company-id", name: "Test Co" }));
  const layer = adminRouter.stack.find((item) => (
    item.route && item.route.path === "/companies/:id/validate-pattern" && item.route.methods.post
  ));
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const response = {
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

  await handler({
    params: { id: "company-id" },
    body: {
      round_sequence: [{
        round_type: "coding",
        enabled: true,
        question_count: 4,
        time_limit_seconds: 600,
        difficulty_distribution: { easy: 50, medium: 25, hard: 25 },
      }],
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /set Easy, Medium, and Hard question counts/);
});
