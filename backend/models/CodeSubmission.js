const mongoose = require("mongoose");

const codeSubmissionSchema = new mongoose.Schema(
  {
    round_attempt: { type: mongoose.Schema.Types.ObjectId, ref: "RoundAttempt", required: true },
    question_id: { type: mongoose.Schema.Types.ObjectId, ref: "CodingQuestion", required: true },
    code: { type: String, required: true },
    language: { type: String, required: true },
    similarity_score: { type: Number, default: null }, // vs other submissions for the same question
  },
  { timestamps: true }
);

module.exports = mongoose.model("CodeSubmission", codeSubmissionSchema);
