const express = require("express");
const mongoose = require("mongoose");
const CodingQuestion = require("../models/CodingQuestion");
const requireAuth = require("../middleware/auth");
const { runCode, isMockMode } = require("../utils/judge0");

const router = express.Router();

// POST /api/code/run — run submitted code against a question's VISIBLE test cases only.
// Nothing is persisted; this is purely for the student to check their work
// before the real scored submission via /api/sessions/:id/submit-round.
async function runCodeHandler(req, res) {
  let stage = "validate request";
  try {
    const { questionId, code, language } = req.body || {};
    if (typeof questionId !== "string" || !mongoose.isValidObjectId(questionId)
      || typeof code !== "string" || !code.trim()
      || typeof language !== "string" || !language.trim()) {
      return res.status(400).json({ message: "A valid question, code, and programming language are required." });
    }

    stage = "load coding question";
    const question = await CodingQuestion.findById(questionId);
    if (!question) return res.status(404).json({ message: "Question not found" });

    const visibleCases = (Array.isArray(question.test_cases) ? question.test_cases : []).filter((tc) => !tc.hidden);
    stage = "run visible test cases";
    const results = await runCode(code, language, visibleCases);

    res.json({ results, mockJudge: isMockMode(language) });
  } catch (err) {
    const message = String(err.message || "Unknown execution error")
      .replace(process.env.RAPIDAPI_KEY || "\u0000", "[redacted]")
      .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted MongoDB URI]");
    console.error("Code execution request failed", {
      userId: req.userId ? String(req.userId) : null,
      questionId: req.body && req.body.questionId,
      stage,
      errorName: err.name,
      errorCode: err.code,
      message,
    });
    const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    let publicMessage;
    if (err.code === "CODE_EXECUTION_NOT_CONFIGURED") {
      publicMessage = "Code execution is not configured for this language. Contact the administrator.";
    } else if ([
      "CODE_EXECUTION_PROVIDER_AUTH",
      "CODE_EXECUTION_PROVIDER_LIMIT",
      "CODE_EXECUTION_TIMEOUT",
    ].includes(err.code)) {
      publicMessage = err.message;
    } else if (err.code === "CODE_EXECUTION_FAILED") {
      publicMessage = "The code execution service failed. Please try again.";
    } else {
      publicMessage = statusCode === 500
        ? "Unable to run this code right now. Please try again."
        : err.message;
    }
    res.status(statusCode).json({ message: publicMessage, code: err.code || "CODE_EXECUTION_FAILED" });
  }
}

router.post("/run", requireAuth, runCodeHandler);

module.exports = router;
module.exports.runCodeHandler = runCodeHandler;
