const mongoose = require("mongoose");

const roundSpecSchema = new mongoose.Schema(
  {
    round_type: { type: String, enum: ["aptitude", "coding", "theory"], required: true },
    question_count: { type: Number, required: true, default: 1 },
    enabled: { type: Boolean, default: true },
    category: { type: String, default: null },
    difficulty: { type: String, default: null },
    time_limit_seconds: { type: Number, default: 300 },
    included_topics: { type: [String], default: [] },
    difficulty_counts: {
      easy: { type: Number, min: 0 },
      medium: { type: Number, min: 0 },
      hard: { type: Number, min: 0 },
    },
    difficulty_distribution: {
      easy: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      hard: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const mockDriveSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ["draft", "published"], default: "draft", required: true },
    round_sequence: { type: [roundSpecSchema], default: [] },
  },
  { timestamps: true }
);

mockDriveSchema.index({ company: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("MockDrive", mockDriveSchema);
