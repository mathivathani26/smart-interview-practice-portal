const express = require("express");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// GET /api/companies  — list all companies with their round pattern
router.get("/", requireAuth, async (req, res) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
    const patterns = await CompanyPattern.find({ company: { $in: companies.map((c) => c._id) } });
    const patternByCompany = Object.fromEntries(patterns.map((p) => [String(p.company), p]));

    const result = companies.map((c) => ({
      id: c._id,
      name: c.name,
      description: c.description,
      has_pattern: !!patternByCompany[String(c._id)] && patternByCompany[String(c._id)].round_sequence.length > 0,
      round_sequence: patternByCompany[String(c._id)] ? patternByCompany[String(c._id)].round_sequence : [],
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching companies" });
  }
});

// GET /api/companies/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const pattern = await CompanyPattern.findOne({ company: company._id });
    res.json({ id: company._id, name: company.name, description: company.description, has_pattern: !!pattern && pattern.round_sequence.length > 0, round_sequence: pattern ? pattern.round_sequence : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching company" });
  }
});

module.exports = router;
