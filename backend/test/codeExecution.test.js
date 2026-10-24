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
      runCode("console.log('unsafe local execution')", "javascript", []),
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
