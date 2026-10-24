const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const Session = require("../models/Session");
const CodingQuestion = require("../models/CodingQuestion");
const RoundAttempt = require("../models/RoundAttempt");
const CodeSubmission = require("../models/CodeSubmission");
const { submitRoundHandler } = require("../routes/sessions");

const SESSION_ID = "507f1f77bcf86cd799439011";
const QUESTION_ID = "507f1f77bcf86cd799439012";
const TEST_CASES = [
  { input: "first", expected_output: "ok", hidden: false },
  { input: "second", expected_output: "ok", hidden: true },
  { input: "third", expected_output: "ok", hidden: false },
];

function statusResult(description, stdout = "", stderr = "") {
  return {
    data: {
      status: { description },
      stdout,
      stderr,
      time: "0.01",
      memory: 1024,
    },
  };
}

async function invokeSubmission({
  results,
  failExecution = false,
  failSubmissionStore = false,
  failAttemptStore = false,
  configureJudge0 = true,
  sessionId = SESSION_ID,
  sessionExists = true,
  missingBody = false,
  question = {
    _id: QUESTION_ID,
    tags: ["arrays"],
    difficulty: "Easy",
    test_cases: TEST_CASES,
  },
  body = {},
} = {}) {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    axiosPost: axios.post,
    sessionFindOne: Session.findOne,
    questionFindById: CodingQuestion.findById,
    attemptCreate: RoundAttempt.create,
    submissionFind: CodeSubmission.find,
    submissionCreate: CodeSubmission.create,
    submissionDelete: CodeSubmission.deleteOne,
    consoleError: console.error,
  };
  let savedAttempt;
  let savedSubmission;
  let cleanupCalled = false;
  let statusCode = 200;
  let responseBody;
  let resultIndex = 0;

  process.env.NODE_ENV = "production";
  if (configureJudge0) process.env.RAPIDAPI_KEY = "test-only-judge-key";
  else delete process.env.RAPIDAPI_KEY;
  Session.findOne = async () => sessionExists
    ? ({ _id: SESSION_ID, mode: "single_question", completed_at: null, drive_rounds: [] })
    : null;
  CodingQuestion.findById = async () => question;
  RoundAttempt.create = async (attempt) => {
    if (failAttemptStore) throw new Error("Attempt database write failed");
    savedAttempt = attempt;
    return { _id: attempt._id || "507f1f77bcf86cd799439013" };
  };
  CodeSubmission.find = () => ({ limit: async () => [] });
  CodeSubmission.create = async (submission) => {
    if (failSubmissionStore) throw new Error("Submission database write failed");
    savedSubmission = submission;
  };
  CodeSubmission.deleteOne = async () => { cleanupCalled = true; };
  console.error = () => {};
  axios.post = async () => {
    if (failExecution) throw new Error("Judge0 network failure");
    return results[resultIndex++];
  };

  try {
    const req = {
      params: { id: sessionId },
      userId: "507f1f77bcf86cd799439014",
      body: missingBody ? undefined : {
        round_type: "coding",
        question_id: QUESTION_ID,
        response: { code: "console.log('ok')", language: "javascript" },
        time_taken: 12,
        tab_switch_count: 0,
        paste_count: 0,
        ...body,
      },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    await submitRoundHandler(req, res);
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.rapidApiKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = original.rapidApiKey;
    axios.post = original.axiosPost;
    Session.findOne = original.sessionFindOne;
    CodingQuestion.findById = original.questionFindById;
    RoundAttempt.create = original.attemptCreate;
    CodeSubmission.find = original.submissionFind;
    CodeSubmission.create = original.submissionCreate;
    CodeSubmission.deleteOne = original.submissionDelete;
    console.error = original.consoleError;
  }

  return { statusCode, responseBody, savedAttempt, savedSubmission, cleanupCalled };
}

test("successful coding submission returns score details and saves the attempt", async () => {
  const result = await invokeSubmission({
    results: [
      statusResult("Accepted", "ok"),
      statusResult("Accepted", "ok"),
      statusResult("Accepted", "ok"),
    ],
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.responseBody.round_score, 100);
  assert.equal(result.responseBody.coding_max_marks, 100);
  assert.equal(result.responseBody.coding_marks_awarded, 100);
  assert.equal(result.responseBody.test_cases_passed, 3);
  assert.equal(result.responseBody.test_cases_total, 3);
  assert.equal(result.responseBody.test_results.length, 3);
  assert.equal(result.responseBody.test_results[1].input, "(hidden)");
  assert.equal(result.responseBody.test_results[1].expected_output, "(hidden)");
  assert.equal(result.responseBody.test_results[1].actual_output, "(hidden)");
  assert.match(result.responseBody.coding_feedback, /3 of 3/);
  assert.equal(result.savedAttempt.round_score, 100);
  assert.equal(result.savedAttempt.coding_max_marks, 100);
  assert.equal(String(result.savedSubmission.round_attempt), String(result.savedAttempt._id));
  assert.equal(String(result.responseBody.roundAttemptId), String(result.savedSubmission.round_attempt));
  assert.equal(result.savedSubmission.code, "console.log('ok')");
});

test("compilation errors are saved as zero-score results with feedback", async () => {
  const result = await invokeSubmission({
    results: [
      statusResult("Compilation Error", "", "Syntax error"),
      statusResult("Compilation Error", "", "Syntax error"),
      statusResult("Compilation Error", "", "Syntax error"),
    ],
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.responseBody.round_score, 0);
  assert.equal(result.savedAttempt.round_score, 0);
  assert.match(result.responseBody.coding_feedback, /Compilation failed/);
  assert.ok(result.responseBody.test_results.every((item) => item.passed === false));
});

test("incorrect test-case results are scored only from accepted tests", async () => {
  const result = await invokeSubmission({
    results: [
      statusResult("Accepted", "ok"),
      statusResult("Wrong Answer", "wrong"),
      statusResult("Wrong Answer", "wrong"),
    ],
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.responseBody.round_score, 33);
  assert.equal(result.responseBody.test_cases_passed, 1);
  assert.equal(result.savedAttempt.round_score, 33);
});

test("successful compilation with incorrect stdout is recorded as Wrong Answer", async () => {
  const result = await invokeSubmission({
    results: [
      statusResult("Accepted", "not ok"),
      statusResult("Accepted", "not ok"),
      statusResult("Accepted", "not ok"),
    ],
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.responseBody.round_score, 0);
  assert.equal(result.responseBody.test_results[0].verdict, "Wrong Answer");
  assert.equal(result.responseBody.test_results[0].passed, false);
});

test("Judge0 service failures return 502 and do not save a score", async () => {
  const result = await invokeSubmission({ failExecution: true });

  assert.equal(result.statusCode, 502);
  assert.equal(result.responseBody.code, "CODE_EXECUTION_FAILED");
  assert.match(result.responseBody.message, /not scored/);
  assert.equal(result.savedAttempt, undefined);
  assert.equal(result.savedSubmission, undefined);
});

test("missing production Judge0 configuration returns 503 without saving a score", async () => {
  const result = await invokeSubmission({ configureJudge0: false });

  assert.equal(result.statusCode, 503);
  assert.equal(result.responseBody.code, "CODE_EXECUTION_NOT_CONFIGURED");
  assert.equal(result.savedAttempt, undefined);
});

test("invalid identifiers and missing coding fields return 400 before scoring", async () => {
  const invalidId = await invokeSubmission({
    body: { question_id: "not-an-object-id" },
  });
  assert.equal(invalidId.statusCode, 400);
  assert.equal(invalidId.savedAttempt, undefined);

  const missingCode = await invokeSubmission({
    body: { response: { code: " ", language: "javascript" } },
  });
  assert.equal(missingCode.statusCode, 400);
  assert.equal(missingCode.savedAttempt, undefined);

  const invalidSessionId = await invokeSubmission({ sessionId: "invalid" });
  assert.equal(invalidSessionId.statusCode, 400);
  assert.equal(invalidSessionId.savedAttempt, undefined);

  const missingSession = await invokeSubmission({ sessionExists: false });
  assert.equal(missingSession.statusCode, 404);
  assert.equal(missingSession.savedAttempt, undefined);

  const invalidRound = await invokeSubmission({
    body: { round_type: "unknown" },
  });
  assert.equal(invalidRound.statusCode, 400);
  assert.equal(invalidRound.savedAttempt, undefined);

  const missingBody = await invokeSubmission({ missingBody: true });
  assert.equal(missingBody.statusCode, 400);
  assert.equal(missingBody.savedAttempt, undefined);
});

test("coding questions without test cases are not scored or saved", async () => {
  const result = await invokeSubmission({
    question: { _id: QUESTION_ID, tags: [], difficulty: "Easy", test_cases: [] },
  });
  assert.equal(result.statusCode, 422);
  assert.equal(result.responseBody.code, "NO_TEST_CASES");
  assert.equal(result.savedAttempt, undefined);
});

test("submission persistence failure does not leave a scored attempt", async () => {
  const result = await invokeSubmission({
    failSubmissionStore: true,
    results: [statusResult("Accepted", "ok"), statusResult("Accepted", "ok"), statusResult("Accepted", "ok")],
  });

  assert.equal(result.statusCode, 500);
  assert.equal(result.savedAttempt, undefined);
  assert.equal(result.responseBody.code, "ROUND_SCORING_FAILED");
});

test("attempt persistence failure removes its unpaired code submission", async () => {
  const result = await invokeSubmission({
    failAttemptStore: true,
    results: [statusResult("Accepted", "ok"), statusResult("Accepted", "ok"), statusResult("Accepted", "ok")],
  });

  assert.equal(result.statusCode, 500);
  assert.equal(result.savedAttempt, undefined);
  assert.equal(result.cleanupCalled, true);
});
