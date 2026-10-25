/**
 * Coding-round code runner.
 *
 * If RAPIDAPI_KEY is set in the environment, this calls the real Judge0 CE API
 * (via RapidAPI) to compile and run submitted code against each test case's
 * stdin and compares stdout to expected_output.
 *
 * Without a key, local execution is development-only.
 */

const axios = require("axios");
const { runLocal, isSupported: isLocallySupported } = require("./localRunner");

const LANGUAGE_IDS = {
  "javascript": 63,
  "python": 71,
  "python3": 71,
  "c": 50,
  "cpp": 54,
  "c++": 54,
  "java": 62,
};

const JUDGE0_HOST = "judge0-ce.p.rapidapi.com";

function executionError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function redactSensitiveText(value) {
  let text = String(value || "Unknown execution error");
  if (process.env.RAPIDAPI_KEY) {
    text = text.split(process.env.RAPIDAPI_KEY).join("[redacted]");
  }
  return text.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted MongoDB URI]");
}

async function runAgainstJudge0(code, language, testCases) {
  const languageId = LANGUAGE_IDS[language.toLowerCase()];
  const results = [];

  for (const [index, tc] of testCases.entries()) {
    try {
      const submitRes = await axios.post(
        `https://${JUDGE0_HOST}/submissions?base64_encoded=false&wait=true`,
        {
          source_code: code,
          language_id: languageId,
          stdin: tc.input,
        },
        {
          headers: {
            "content-type": "application/json",
            "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
            "X-RapidAPI-Host": JUDGE0_HOST,
          },
          timeout: 15000,
        }
      );

      const actual = (submitRes.data.stdout || "").trim();
      const expected = (tc.expected_output || "").trim();
      // Judge0's own status description: "Accepted", "Wrong Answer",
      // "Time Limit Exceeded", "Runtime Error", "Compilation Error", etc.
      const judgeVerdict = submitRes.data.status
        ? submitRes.data.status.description
        : (actual === expected ? "Accepted" : "Wrong Answer");
      if (["In Queue", "Processing", "Internal Error"].includes(judgeVerdict)) {
        throw executionError(
          "CODE_EXECUTION_FAILED",
          `Judge0 returned an incomplete result: ${judgeVerdict}.`,
          502
        );
      }
      const verdict = judgeVerdict === "Accepted" && actual !== expected
        ? "Wrong Answer"
        : judgeVerdict;
      const passed = verdict === "Accepted" && actual === expected;
      const outputParts = [];
      if (actual) outputParts.push(actual);
      if (submitRes.data.stderr) outputParts.push(`Error: ${submitRes.data.stderr.trim()}`);
      if (submitRes.data.compile_output) {
        outputParts.push(`Compiler output: ${submitRes.data.compile_output.trim()}`);
      }
      if (submitRes.data.message) outputParts.push(`Execution message: ${submitRes.data.message}`);

      results.push({
        input: tc.hidden ? "(hidden)" : tc.input,
        expected_output: tc.hidden ? "(hidden)" : tc.expected_output,
        actual_output: tc.hidden ? "(hidden)" : outputParts.join("\n") || "(no output)",
        passed,
        verdict,
        time_ms: submitRes.data.time ? Math.round(parseFloat(submitRes.data.time) * 1000) : null,
        memory_kb: submitRes.data.memory || null,
        hidden: tc.hidden,
      });
    } catch (err) {
      const providerStatus = err.response && err.response.status;
      const timedOut = ["ECONNABORTED", "ETIMEDOUT"].includes(err.code);
      console.error("Judge0 execution request failed", {
        testCase: index + 1,
        errorName: err.name,
        errorCode: err.code,
        statusCode: providerStatus,
        message: redactSensitiveText(err.message),
      });
      if (providerStatus === 401 || providerStatus === 403) {
        throw executionError(
          "CODE_EXECUTION_PROVIDER_AUTH",
          "The code execution service is not authorized. Contact the administrator.",
          503
        );
      }
      if (providerStatus === 429) {
        throw executionError(
          "CODE_EXECUTION_PROVIDER_LIMIT",
          "The code execution service is temporarily busy. Please try again shortly.",
          503
        );
      }
      if (timedOut) {
        throw executionError(
          "CODE_EXECUTION_TIMEOUT",
          "The code execution service timed out. Please try again.",
          504
        );
      }
      throw executionError(
        "CODE_EXECUTION_FAILED",
        "The code execution service failed. Please try again.",
        502
      );
    }
  }
  return results;
}

async function runCode(code, language, testCases) {
  const normalizedLanguage = typeof language === "string" ? language.trim().toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(LANGUAGE_IDS, normalizedLanguage)) {
    throw executionError("INVALID_LANGUAGE", "Select a supported programming language.", 400);
  }
  if (!Array.isArray(testCases) || testCases.length === 0) {
    throw executionError("NO_TEST_CASES", "This coding question has no test cases available for scoring.", 422);
  }

  // Guard against empty/whitespace-only submissions before invoking an executor.
  if (!code || !code.trim()) {
    return testCases.map((tc) => ({
      input: tc.hidden ? "(hidden)" : tc.input,
      expected_output: tc.hidden ? "(hidden)" : tc.expected_output,
      actual_output: "No code submitted",
      passed: false,
      verdict: "No Submission",
      time_ms: null,
      memory_kb: null,
      hidden: tc.hidden,
    }));
  }

  if (process.env.RAPIDAPI_KEY) {
    return runAgainstJudge0(code, normalizedLanguage, testCases);
  }

  if (process.env.NODE_ENV === "production") {
    throw executionError(
      "CODE_EXECUTION_NOT_CONFIGURED",
      "Judge0 must be configured for production code execution.",
      503
    );
  }

  // No Judge0 key — try real local execution only in development.
  if (isLocallySupported(normalizedLanguage)) {
    return runLocal(code, normalizedLanguage, testCases);
  }

  throw executionError(
    "CODE_EXECUTION_NOT_CONFIGURED",
    "No execution provider or local interpreter is available for this language. Configure Judge0 with RAPIDAPI_KEY.",
    503
  );
}

module.exports = {
  runCode,
  LANGUAGE_IDS,
  isMockMode: () => false,
};
