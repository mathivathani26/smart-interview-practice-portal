const test = require("node:test");
const assert = require("node:assert/strict");
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
