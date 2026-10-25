const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { runCode } = require("../utils/judge0");

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("production code execution requires Judge0 instead of running submissions locally", async () => {
  await withEnvironment({ NODE_ENV: "production", RAPIDAPI_KEY: undefined }, async () => {
    await assert.rejects(
      runCode("console.log('unsafe local execution')", "javascript", [
        { input: "", expected_output: "unsafe local execution", hidden: false },
      ]),
      { code: "CODE_EXECUTION_NOT_CONFIGURED" }
    );
  });
});

test("local JavaScript execution remains available outside production", async () => {
  await withEnvironment({ NODE_ENV: "development", RAPIDAPI_KEY: undefined }, async () => {
    const [result] = await runCode("console.log('4')", "javascript", [
      { input: "", expected_output: "4", hidden: false },
    ]);

    assert.equal(result.passed, true);
    assert.equal(result.verdict, "Accepted");
  });
});

test("rejects unsupported languages and questions without test cases", async () => {
  await withEnvironment({ NODE_ENV: "development", RAPIDAPI_KEY: undefined }, async () => {
    await assert.rejects(
      runCode("print('ok')", "ruby", [{ input: "", expected_output: "ok" }]),
      { code: "INVALID_LANGUAGE", statusCode: 400 }
    );
    await assert.rejects(
      runCode("console.log('ok')", "javascript", []),
      { code: "NO_TEST_CASES", statusCode: 422 }
    );
  });
});

test("does not return simulated results when a language has no configured executor", async () => {
  await withEnvironment({ NODE_ENV: "development", RAPIDAPI_KEY: undefined }, async () => {
    await assert.rejects(
      runCode("int main(void) { return 0; }", "c", [
        { input: "", expected_output: "", hidden: false },
      ]),
      { code: "CODE_EXECUTION_NOT_CONFIGURED", statusCode: 503 }
    );
  });
});

test("sends every selectable language to its matching Judge0 language ID", async () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    axiosPost: axios.post,
  };
  const requests = [];
  process.env.NODE_ENV = "production";
  process.env.RAPIDAPI_KEY = "test-only-judge-key";
  axios.post = async (url, body) => {
    requests.push({ url, body });
    return { data: { status: { description: "Accepted" }, stdout: "42", time: "0.01", memory: 1024 } };
  };

  try {
    const expectedLanguages = [
      ["python3", 71],
      ["c", 50],
      ["cpp", 54],
      ["java", 62],
      ["javascript", 63],
    ];
    for (const [language, languageId] of expectedLanguages) {
      const [result] = await runCode("print(42)", language, [
        { input: "input", expected_output: "42", hidden: false },
      ]);
      assert.equal(result.passed, true);
      const request = requests[requests.length - 1];
      assert.equal(request.body.language_id, languageId);
      assert.equal(request.body.source_code, "print(42)");
      assert.equal(request.body.stdin, "input");
    }
    assert.equal(requests.length, expectedLanguages.length);
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.rapidApiKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = original.rapidApiKey;
    axios.post = original.axiosPost;
  }
});

test("returns compiler output and preserves failed execution verdicts", async () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    axiosPost: axios.post,
  };
  process.env.NODE_ENV = "production";
  process.env.RAPIDAPI_KEY = "test-only-judge-key";
  const providerResults = [
    { status: { description: "Compilation Error" }, stdout: null, stderr: null, compile_output: "syntax error" },
    { status: { description: "Runtime Error" }, stdout: null, stderr: "program failed", compile_output: null },
    { status: { description: "Time Limit Exceeded" }, stdout: null, stderr: null, compile_output: null },
  ];
  axios.post = async () => ({ data: providerResults.shift() });

  try {
    const [compileResult] = await runCode("bad code", "cpp", [
      { input: "", expected_output: "ok", hidden: false },
    ]);
    assert.equal(compileResult.verdict, "Compilation Error");
    assert.equal(compileResult.passed, false);
    assert.match(compileResult.actual_output, /syntax error/);

    const [runtimeResult] = await runCode("throw", "javascript", [
      { input: "", expected_output: "ok", hidden: false },
    ]);
    assert.equal(runtimeResult.verdict, "Runtime Error");
    assert.equal(runtimeResult.passed, false);
    assert.match(runtimeResult.actual_output, /program failed/);

    const [timeoutResult] = await runCode("loop", "python3", [
      { input: "", expected_output: "ok", hidden: false },
    ]);
    assert.equal(timeoutResult.verdict, "Time Limit Exceeded");
    assert.equal(timeoutResult.passed, false);
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.rapidApiKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = original.rapidApiKey;
    axios.post = original.axiosPost;
  }
});

test("reports provider request timeouts as unavailable execution, not test results", async () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    rapidApiKey: process.env.RAPIDAPI_KEY,
    axiosPost: axios.post,
    consoleError: console.error,
  };
  process.env.NODE_ENV = "production";
  process.env.RAPIDAPI_KEY = "test-only-judge-key";
  const timeoutError = new Error("request timed out");
  timeoutError.code = "ECONNABORTED";
  axios.post = async () => { throw timeoutError; };
  console.error = () => {};

  try {
    await assert.rejects(
      runCode("print('ok')", "python3", [
        { input: "", expected_output: "ok", hidden: false },
      ]),
      { code: "CODE_EXECUTION_TIMEOUT", statusCode: 504 }
    );
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.rapidApiKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = original.rapidApiKey;
    axios.post = original.axiosPost;
    console.error = original.consoleError;
  }
});

test("local execution keeps hidden test inputs and outputs hidden", async () => {
  await withEnvironment({ NODE_ENV: "development", RAPIDAPI_KEY: undefined }, async () => {
    const [result] = await runCode("console.log('secret')", "javascript", [
      { input: "secret input", expected_output: "secret", hidden: true },
    ]);

    assert.equal(result.passed, true);
    assert.equal(result.input, "(hidden)");
    assert.equal(result.expected_output, "(hidden)");
    assert.equal(result.actual_output, "(hidden)");
  });
});
