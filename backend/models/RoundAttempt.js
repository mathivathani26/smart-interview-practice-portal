const mongoose = require("mongoose");

const roundAttemptSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    round_type: { type: String, enum: ["aptitude", "coding", "theory"], required: true },
    question_id: { type: mongoose.Schema.Types.ObjectId, required: true }, // refs whichever bank matches round_type
    category: { type: String, default: "" },
    difficulty: { type: String, default: "" },

    response: { type: mongoose.Schema.Types.Mixed }, // selected_option | {code, language} | answer_text

    round_score: { type: Number, required: true }, // 0-100
    time_taken: { type: Number, default: 0 }, // seconds
    tab_switch_count: { type: Number, default: 0 },
    paste_count: { type: Number, default: 0 }, // coding round: number of paste events into the editor

    // theory-specific scoring detail
    jaccard_score: { type: Number, default: null },
    tfidf_score: { type: Number, default: null },
    matched_concepts: [{ type: String }],
    missing_concepts: [{ type: String }],

    // coding-specific scoring detail
    test_cases_passed: { type: Number, default: null },
    test_cases_total: { type: Number, default: null },
    test_results: { type: mongoose.Schema.Types.Mixed, default: null }, // per-test verdict, time, memory
    matched_approach_tags: [{ type: String }], // e.g. "hash map" — techniques detected in the submitted code
    missing_approach_tags: [{ type: String }], // technique tags on the question that weren't detected
  },
  { timestamps: true }
);

module.exports = mongoose.model("RoundAttempt", roundAttemptSchema);
