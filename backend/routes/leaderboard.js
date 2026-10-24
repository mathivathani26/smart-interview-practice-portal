const express = require("express");
const Session = require("../models/Session");
const Company = require("../models/Company");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// GET /api/leaderboard?companyId=...
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId, driveId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // best score per user for this company
    const sessionFilter = { company: companyId, completed_at: { $ne: null } };
    if (driveId) sessionFilter.mock_drive = driveId;
    const sessions = await Session.find(sessionFilter)
      .populate({ path: "user", select: "firstName lastName role", match: { role: "student" } })
      .sort({ total_score: -1 });

    const bestByUser = new Map();
    sessions.filter((session) => session.user && session.user.role === "student").forEach((s) => {
      const uid = String(s.user._id);
      if (!bestByUser.has(uid) || bestByUser.get(uid).total_score < s.total_score) {
        bestByUser.set(uid, { user: s.user, total_score: s.total_score });
      }
    });

    const ranked = [...bestByUser.values()].sort((a, b) => b.total_score - a.total_score);
    const leaderboard = ranked.slice(0, 20).map((r, i) => ({
      rank: i + 1,
      name: `${r.user.firstName} ${r.user.lastName}`,
      score: r.total_score,
      isMe: String(r.user._id) === String(req.userId),
    }));

    const myRank = ranked.findIndex((r) => String(r.user._id) === String(req.userId));

    res.json({
      company: company.name,
      totalParticipants: ranked.length,
      leaderboard,
      myRank: myRank === -1 ? null : myRank + 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching leaderboard" });
  }
});

module.exports = router;
