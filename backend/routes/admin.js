const express = require("express");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const requireAuth = require("../middleware/auth");
const requireAdmin = require("../middleware/adminOnly");
const { validateRoundSequence } = require("../utils/companyPattern");

const router = express.Router();
router.use(requireAuth, requireAdmin);

function crudFor(path, Model) {
  router.get(`/${path}`, async (req, res) => {
    const items = await Model.find().sort({ createdAt: -1 });
    res.json(items);
  });
  router.post(`/${path}`, async (req, res) => {
    try {
      const item = await Model.create(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });
  router.put(`/${path}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });
  router.delete(`/${path}/:id`, async (req, res) => {
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json({ deleted: true });
  });
}

crudFor("questions/aptitude", AptitudeQuestion);
crudFor("questions/coding", CodingQuestion);
crudFor("questions/theory", TheoryQuestion);

// Companies + patterns (custom, since a pattern is a nested sub-document)
router.get("/companies", async (req, res) => {
  const companies = await Company.find().sort({ name: 1 });
  const patterns = await CompanyPattern.find({ company: { $in: companies.map((c) => c._id) } });
  const patternByCompany = Object.fromEntries(patterns.map((p) => [String(p.company), p]));
  res.json(companies.map((c) => {
    const pattern = patternByCompany[String(c._id)];
    return {
      id: c._id,
      name: c.name,
      description: c.description,
      has_pattern: !!pattern && pattern.round_sequence.length > 0,
      round_sequence: pattern ? pattern.round_sequence : [],
    };
  }));
});

router.post("/companies", async (req, res) => {
  try {
    const { name, description, round_sequence } = req.body;
    if (round_sequence && round_sequence.length > 0) {
      const validationError = validateRoundSequence(round_sequence);
      if (validationError) return res.status(400).json({ message: validationError });
    }
    const company = await Company.create({ name, description });
    const pattern = await CompanyPattern.create({ company: company._id, round_sequence: round_sequence || [] });
    res.status(201).json({ id: company._id, name: company.name, description: company.description, has_pattern: pattern.round_sequence.length > 0, round_sequence: pattern.round_sequence });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/companies/:id/pattern", async (req, res) => {
  try {
    const { round_sequence } = req.body;
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const validationError = validateRoundSequence(round_sequence);
    if (validationError) return res.status(400).json({ message: validationError });
    const pattern = await CompanyPattern.findOneAndUpdate(
      { company: company._id },
      { round_sequence },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(pattern);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete("/companies/:id", async (req, res) => {
  await Company.findByIdAndDelete(req.params.id);
  await CompanyPattern.deleteOne({ company: req.params.id });
  res.json({ deleted: true });
});

module.exports = router;
