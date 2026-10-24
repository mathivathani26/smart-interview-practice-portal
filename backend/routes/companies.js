const express = require("express");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const requireAuth = require("../middleware/auth");
const { validateRoundSequence, validateRoundAvailability } = require("../utils/companyPattern");
const { getCompanyQuestionIds } = require("../utils/companyQuestionAssignments");

const router = express.Router();
const QUESTION_BANKS = {
  aptitude: AptitudeQuestion,
  coding: CodingQuestion,
  theory: TheoryQuestion,
};

async function getValidRoundSequence(company, pattern) {
  if (!pattern || pattern.round_sequence.length === 0) return [];
  const sequence = pattern.round_sequence.map((round) => round.toObject());
  if (validateRoundSequence(sequence)) return [];
  const questionIdsByType = await getCompanyQuestionIds(company._id);
  const errors = await validateRoundAvailability(sequence, QUESTION_BANKS, company.name, questionIdsByType);
  return errors.length === 0 ? sequence : [];
}

async function getPublishedDrives(company, pattern) {
  const drives = await MockDrive.find({ company: company._id, status: "published" }).sort({ createdAt: 1 });
  const questionIdsByType = await getCompanyQuestionIds(company._id);
  const validDrives = [];
  for (const drive of drives) {
    const sequence = drive.round_sequence.map((round) => round.toObject());
    if (validateRoundSequence(sequence)) continue;
    const errors = await validateRoundAvailability(sequence, QUESTION_BANKS, company.name, questionIdsByType);
    if (errors.length) continue;
    validDrives.push({
      id: drive._id,
      name: drive.name,
      status: drive.status,
      round_sequence: sequence,
    });
  }

  if (!drives.length && pattern && pattern.round_sequence.length > 0) {
    const legacySequence = await getValidRoundSequence(company, pattern);
    if (legacySequence.length) {
      validDrives.push({
        id: pattern._id,
        name: "Existing Mock Drive",
        status: "published",
        legacy: true,
        round_sequence: legacySequence,
      });
    }
  }
  return validDrives;
}

// GET /api/companies  — list all companies with their round pattern
router.get("/", requireAuth, async (req, res) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
    const patterns = await CompanyPattern.find({ company: { $in: companies.map((c) => c._id) } });
    const patternByCompany = Object.fromEntries(patterns.map((p) => [String(p.company), p]));

    const result = (await Promise.all(companies.map(async (company) => {
      const drives = await getPublishedDrives(company, patternByCompany[String(company._id)]);
      return {
        id: company._id,
        name: company.name,
        description: company.description,
        has_pattern: drives.length > 0,
        drives,
      };
    }))).filter((company) => company.drives.length > 0);
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
    const drives = await getPublishedDrives(company, pattern);
    res.json({
      id: company._id,
      name: company.name,
      description: company.description,
      has_pattern: drives.length > 0,
      drives,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching company" });
  }
});

module.exports = router;
