/**
 * Coding-round code runner.
 *
 * If RAPIDAPI_KEY is set in the environment, this calls the real Judge0 CE API
 * (via RapidAPI) to compile and run submitted code against each test case's
 * stdin and compares stdout to expected_output.
 *
 * Without a key, local execution and simulation are development-only.
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

      results.push({
        input: tc.hidden ? "(hidden)" : tc.input,
        expected_output: tc.hidden ? "(hidden)" : tc.expected_output,
        actual_output: tc.hidden
          ? "(hidden)"
          : submitRes.data.stderr ? `Error: ${submitRes.data.stderr}` : actual,
        passed,
        verdict,
        time_ms: submitRes.data.time ? Math.round(parseFloat(submitRes.data.time) * 1000) : null,
        memory_kb: submitRes.data.memory || null,
        hidden: tc.hidden,
      });
    } catch (err) {
      console.error("Judge0 execution request failed", {
        testCase: index + 1,
        errorName: err.name,
        errorCode: err.code,
        statusCode: err.response && err.response.status,
        message: redactSensitiveText(err.message),
      });
      throw executionError(
        "CODE_EXECUTION_FAILED",
        "The code execution service failed. Please try again.",
        502
      );
    }
  }
  return results;
}

function runMock(code, language, testCases) {
  // Deterministic-ish mock: longer / non-empty code passes more often,
  // just so behavior feels responsive to actually writing something.
  const effortBonus = code && code.trim().length > 30 ? 0.25 : 0;
  const MOCK_FAIL_VERDICTS = ["Wrong Answer", "Time Limit Exceeded", "Runtime Error"];
  return testCases.map((tc) => {
    const passed = Math.random() < 0.55 + effortBonus;
    const verdict = passed ? "Accepted" : MOCK_FAIL_VERDICTS[Math.floor(Math.random() * MOCK_FAIL_VERDICTS.length)];
    return {
      input: tc.hidden ? "(hidden)" : tc.input,
      expected_output: tc.hidden ? "(hidden)" : tc.expected_output,
      actual_output: tc.hidden ? "(hidden)" : (passed ? tc.expected_output : "(mock) output did not match"),
      passed,
      verdict,
      time_ms: passed ? Math.round(20 + Math.random() * 120) : null,
      memory_kb: passed ? Math.round(6000 + Math.random() * 9000) : null,
      hidden: tc.hidden,
    };
  });
}

async function runCode(code, language, testCases) {
  const normalizedLanguage = typeof language === "string" ? language.trim().toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(LANGUAGE_IDS, normalizedLanguage)) {
    throw executionError("INVALID_LANGUAGE", "Select a supported programming language.", 400);
  }
  if (!Array.isArray(testCases) || testCases.length === 0) {
    throw executionError("NO_TEST_CASES", "This coding question has no test cases available for scoring.", 422);
  }

  // Guard against empty/whitespace-only submissions — neither the mock judge
  // nor a real judge should ever mark these as passing.
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

  // No Judge0 key — try REAL local execution (Python via a local interpreter,
  // JavaScript via this same Node.js binary) before ever falling back to
  // the simulated mock. This is intended only for local development.
  if (isLocallySupported(normalizedLanguage)) {
    return runLocal(code, normalizedLanguage, testCases);
  }

  // Only reached for languages we can't execute locally (e.g. C++/Java
  // without a compiler present) and no Judge0 key configured — this is
  // simulated, not real, and clearly labeled as such via isMockMode().
  return runMock(code, normalizedLanguage, testCases);
}

function usedRealExecution(language) {
  const normalizedLanguage = typeof language === "string" ? language.trim().toLowerCase() : "";
  return !!process.env.RAPIDAPI_KEY || isLocallySupported(normalizedLanguage);
}

module.exports = {
  runCode,
  // true only when NEITHER real Judge0 NOR real local execution is being used for this language
  isMockMode: (language) => !usedRealExecution(language),
};
