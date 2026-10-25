const mongoose = require("mongoose");
const { normalizeTags } = require("../utils/codingTags");

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    expected_output: { type: String, required: true },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const codingQuestionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    tags: [{ type: String }],
    input_format: { type: String, default: "" },
    output_format: { type: String, default: "" },
    constraints: [{ type: String }],
    sample_input: { type: String, default: "" },
    sample_output: { type: String, default: "" },
    // Per-language starter template keyed by the Judge0 language identifier.
    // Each includes the stdin/stdout boilerplate for that language, with the
    // core logic left as a stub for the student to fill in.
    starter_code: { type: mongoose.Schema.Types.Mixed, default: {} },
    test_cases: [testCaseSchema],
  },
  { timestamps: true }
);

codingQuestionSchema.pre("validate", function normalizeCodingQuestionTags() {
  this.tags = normalizeTags(this.tags);
});

codingQuestionSchema.pre("findOneAndUpdate", function normalizeCodingQuestionTagUpdates() {
  const update = this.getUpdate() || {};
  const target = update.$set || update;
  if (Object.prototype.hasOwnProperty.call(target, "tags")) {
    target.tags = normalizeTags(target.tags);
    this.setUpdate(update);
  }
});

module.exports = mongoose.model("CodingQuestion", codingQuestionSchema);
