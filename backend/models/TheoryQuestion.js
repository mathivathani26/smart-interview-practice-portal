const mongoose = require("mongoose");

const theoryQuestionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    question_text: { type: String, required: true },
    ideal_concepts: [{ type: String, required: true }],
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TheoryQuestion", theoryQuestionSchema);
