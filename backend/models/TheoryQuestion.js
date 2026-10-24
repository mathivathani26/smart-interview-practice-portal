const mongoose = require("mongoose");

const theoryQuestionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    question_text: { type: String, required: true },
    ideal_concepts: [{ type: String, required: true }],
    reference_answer: { type: String, default: "" },
    marking_rubric: [{ type: String }],
    max_marks: { type: Number, default: 10, min: 1 },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TheoryQuestion", theoryQuestionSchema);
