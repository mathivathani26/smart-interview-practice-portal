const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const CodingQuestion = require("../models/CodingQuestion");
const { runCodeHandler } = require("../routes/code");

const QUESTION_ID = "507f1f77bcf86cd799439012";
const TEST_CASES = [
  { input: "", expected_output: "42", hidden: false },
  { input: "secret", expected_output: "42", hidden: true },
];

async function invokeRun({ body, providerFailure, providerResponse } = {}) {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    axiosPost: axios.post,
    questionFindById: CodingQuestion.findById,
    consoleError: console.error,
  };
  let statusCode = 200;
  let responseBody;
  let questionId;
  process.env.NODE_ENV = "production";
  process.env.RAPIDAPI_KEY = "test-only-judge-key";
  CodingQuestion.findById = async (id) => {
    questionId = id;
    return { test_cases: TEST_CASES };
  };
  axios.post = async () => {
    if (providerFailure) throw providerFailure;
    return { data: providerResponse || {
      status: { description: "Accepted" },
      stdout: "42",
      time: "0.01",
      memory: 1024,
    } };
  };
  console.error = () => {};

  try {
    await runCodeHandler(
      { body, userId: "507f1f77bcf86cd799439014" },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      }
    );
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.rapidApiKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = original.rapidApiKey;
    axios.post = original.axiosPost;
    CodingQuestion.findById = original.questionFindById;
    console.error = original.consoleError;
  }

  return { statusCode, responseBody, questionId };
}

test("Run Code validates missing and malformed request fields", async () => {
  const missing = await invokeRun({ body: undefined });
  assert.equal(missing.statusCode, 400);

  const malformed = await invokeRun({
    body: { questionId: "not-an-id", code: "print(42)", language: "python3" },
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.questionId, undefined);

  const missingLanguage = await invokeRun({
    body: { questionId: QUESTION_ID, code: "print(42)" },
  });
  assert.equal(missingLanguage.statusCode, 400);
});

test("Run Code executes visible tests and returns actual output without hidden cases", async () => {
  const result = await invokeRun({
    body: { questionId: QUESTION_ID, code: "console.log(42)", language: "javascript" },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.questionId, QUESTION_ID);
  assert.equal(result.responseBody.results.length, 1);
  assert.equal(result.responseBody.results[0].input, "");
  assert.equal(result.responseBody.results[0].actual_output, "42");
  assert.equal(result.responseBody.results[0].passed, true);
  assert.equal(result.responseBody.mockJudge, false);
});

test("Run Code reports provider authorization errors without exposing response details", async () => {
  const providerFailure = new Error("key rejected");
  providerFailure.response = { status: 403 };
  const result = await invokeRun({
    body: { questionId: QUESTION_ID, code: "console.log(42)", language: "javascript" },
    providerFailure,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.responseBody.code, "CODE_EXECUTION_PROVIDER_AUTH");
  assert.doesNotMatch(result.responseBody.message, /key rejected/);
});
