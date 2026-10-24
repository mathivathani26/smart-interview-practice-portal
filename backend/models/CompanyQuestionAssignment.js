const mongoose = require("mongoose");

const companyQuestionAssignmentSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    round_type: { type: String, enum: ["aptitude", "theory", "coding"], required: true },
    question: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

companyQuestionAssignmentSchema.index(
  { company: 1, round_type: 1, question: 1 },
  { unique: true }
);

module.exports = mongoose.model("CompanyQuestionAssignment", companyQuestionAssignmentSchema);
