const mongoose = require("mongoose");

const aptitudeQuestionSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ["quantitative", "logical", "verbal"], required: true },
    question_text: { type: String, required: true },
    options: [{ type: String, required: true }],
    correct_option: { type: String, default: null },
    correct_options: [{ type: String }],
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
  },
  { timestamps: true }
);

aptitudeQuestionSchema.pre("validate", function nextValidate() {
  if (!Array.isArray(this.correct_options) || this.correct_options.length === 0) {
    if (this.correct_option) {
      this.correct_options = [this.correct_option];
    }
  }

  if (!this.correct_option && Array.isArray(this.correct_options) && this.correct_options.length > 0) {
    this.correct_option = this.correct_options[0];
  }

  if (Array.isArray(this.correct_options)) {
    this.correct_options = [...new Set(this.correct_options.map((value) => String(value).trim()).filter(Boolean))];
  }

  if (Array.isArray(this.options)) {
    this.options = this.options.map((value) => String(value).trim()).filter(Boolean);
  }

  if (this.correct_option) {
    this.correct_option = String(this.correct_option).trim();
  }
});

module.exports = mongoose.model("AptitudeQuestion", aptitudeQuestionSchema);
