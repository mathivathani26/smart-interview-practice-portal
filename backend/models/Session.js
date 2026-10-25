const mongoose = require("mongoose");

const assignedRoundSchema = new mongoose.Schema(
  {
    round_type: { type: String, enum: ["aptitude", "coding", "theory"], required: true },
    question_count: { type: Number, required: true },
    time_limit_seconds: { type: Number, required: true },
    category: { type: String, default: null },
    difficulty: { type: String, default: null },
    included_topics: [{ type: String }],
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
    question_ids: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    mock_drive: { type: mongoose.Schema.Types.ObjectId, ref: "MockDrive", default: null },
    drive_name: { type: String, default: null },
    mode: { type: String, enum: ["mock_drive", "single_question"], required: true },
    drive_rounds: { type: [assignedRoundSchema], default: [] },
    total_score: { type: Number, default: null },
    started_at: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
