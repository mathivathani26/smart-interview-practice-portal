const test = require("node:test");
const assert = require("node:assert/strict");
const CodingQuestion = require("../models/CodingQuestion");
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
