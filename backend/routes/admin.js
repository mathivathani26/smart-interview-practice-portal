const express = require("express");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const { getCompanyQuestionIds } = require("../utils/companyQuestionAssignments");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const requireAuth = require("../middleware/auth");
const requireAdmin = require("../middleware/adminOnly");
const { validateRoundSequence, validateRoundAvailability } = require("../utils/companyPattern");

const router = express.Router();
router.use(requireAuth, requireAdmin);

const QUESTION_BANKS = {
  aptitude: AptitudeQuestion,
  coding: CodingQuestion,
  theory: TheoryQuestion,
};

async function getAllocationErrors(roundSequence, companyName, companyId) {
  const questionIdsByType = companyId ? await getCompanyQuestionIds(companyId) : {};
  return validateRoundAvailability(roundSequence, QUESTION_BANKS, companyName, questionIdsByType);
}

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
  const drives = await MockDrive.find({ company: { $in: companies.map((c) => c._id) } }).sort({ createdAt: 1 });
  const patternByCompany = Object.fromEntries(patterns.map((p) => [String(p.company), p]));
  const drivesByCompany = new Map();
  drives.forEach((drive) => {
    const key = String(drive.company);
    if (!drivesByCompany.has(key)) drivesByCompany.set(key, []);
    drivesByCompany.get(key).push(drive);
  });
  res.json(companies.map((c) => {
    const pattern = patternByCompany[String(c._id)];
    return {
      id: c._id,
      name: c.name,
      description: c.description,
      has_pattern: !!pattern && pattern.round_sequence.length > 0,
      round_sequence: pattern ? pattern.round_sequence : [],
      drives: drivesByCompany.get(String(c._id)) || [],
    };
  }));
});

router.post("/companies/:id/drives", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const { name, round_sequence } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Drive name is required." });
    }
    if (!Array.isArray(round_sequence) || round_sequence.length === 0) {
      return res.status(400).json({ message: "Configure at least one round before saving the drive." });
    }
    const validationError = validateRoundSequence(round_sequence);
    if (validationError) return res.status(400).json({ message: validationError });
    const drive = await MockDrive.create({
      company: company._id,
      name: name.trim(),
      round_sequence,
      status: "draft",
    });
    res.status(201).json(drive);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A drive with this name already exists for this company." });
    res.status(400).json({ message: err.message });
  }
});

router.put("/drives/:id", async (req, res) => {
  try {
    const drive = await MockDrive.findById(req.params.id).populate("company", "name");
    if (!drive) return res.status(404).json({ message: "Mock drive not found" });
    const { name, round_sequence } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Drive name is required." });
    }
    const validationError = validateRoundSequence(round_sequence);
    if (validationError) return res.status(400).json({ message: validationError });
    if (drive.status === "published") {
      const allocationErrors = await getAllocationErrors(round_sequence, drive.company.name, drive.company._id);
      if (allocationErrors.length) {
        return res.status(409).json({ message: allocationErrors.join("\n"), errors: allocationErrors });
      }
    }
    drive.name = name.trim();
    drive.round_sequence = round_sequence;
    await drive.save();
    res.json(drive);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A drive with this name already exists for this company." });
    res.status(400).json({ message: err.message });
  }
});

router.put("/drives/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({ message: "Status must be draft or published." });
    }
    const drive = await MockDrive.findById(req.params.id).populate("company", "name");
    if (!drive) return res.status(404).json({ message: "Mock drive not found" });
    if (status === "published") {
      const validationError = validateRoundSequence(drive.round_sequence.map((round) => round.toObject()));
      if (validationError) return res.status(409).json({ message: validationError });
      const allocationErrors = await getAllocationErrors(drive.round_sequence, drive.company.name, drive.company._id);
      if (allocationErrors.length) {
        return res.status(409).json({ message: allocationErrors.join("\n"), errors: allocationErrors });
      }
    }
    drive.status = status;
    await drive.save();
    res.json(drive);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error updating mock-drive status" });
  }
});

router.delete("/drives/:id", async (req, res) => {
  const drive = await MockDrive.findByIdAndDelete(req.params.id);
  if (!drive) return res.status(404).json({ message: "Mock drive not found" });
  res.json({ deleted: true });
});

router.post("/companies", async (req, res) => {
  try {
    const { name, description, round_sequence } = req.body;
    if (round_sequence && round_sequence.length > 0) {
      const validationError = validateRoundSequence(round_sequence);
      if (validationError) return res.status(400).json({ message: validationError });
      const allocationErrors = await getAllocationErrors(round_sequence, name);
      if (allocationErrors.length) {
        return res.status(400).json({ message: allocationErrors.join("\n"), errors: allocationErrors });
      }
    }
    const company = await Company.create({ name, description });
    const pattern = await CompanyPattern.create({ company: company._id, round_sequence: round_sequence || [] });
    res.status(201).json({ id: company._id, name: company.name, description: company.description, has_pattern: pattern.round_sequence.length > 0, round_sequence: pattern.round_sequence });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/companies/:id/validate-pattern", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const { round_sequence } = req.body;
    const validationError = validateRoundSequence(round_sequence);
    if (validationError) {
      return res.status(400).json({ message: validationError, errors: [validationError] });
    }
    const errors = await getAllocationErrors(round_sequence, company.name, company._id);
    res.json({ valid: errors.length === 0, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error validating mock-drive settings" });
  }
});

router.put("/companies/:id/pattern", async (req, res) => {
  try {
    const { round_sequence } = req.body;
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const validationError = validateRoundSequence(round_sequence);
    if (validationError) return res.status(400).json({ message: validationError });
    const allocationErrors = await getAllocationErrors(round_sequence, company.name, company._id);
    if (allocationErrors.length) {
      return res.status(400).json({ message: allocationErrors.join("\n"), errors: allocationErrors });
    }
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
  await MockDrive.deleteMany({ company: req.params.id });
  res.json({ deleted: true });
});

module.exports = router;
