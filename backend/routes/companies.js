const express = require("express");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const requireAuth = require("../middleware/auth");
const { validateRoundSequence, validateRoundAvailability } = require("../utils/companyPattern");
const { selectCanonicalDriveConfig } = require("../utils/canonicalDriveConfig");
const { getCompanyQuestionIds } = require("../utils/companyQuestionAssignments");

const router = express.Router();
const QUESTION_BANKS = {
  aptitude: AptitudeQuestion,
  coding: CodingQuestion,
  theory: TheoryQuestion,
};

async function getCompanyDrive(company, pattern) {
  const legacyDrives = await MockDrive.find({ company: company._id, status: "published" })
    .sort({ createdAt: 1, _id: 1 });
  const config = selectCanonicalDriveConfig(pattern, legacyDrives);
  const sequence = config.round_sequence.map((round) => (
    typeof round.toObject === "function" ? round.toObject() : round
  ));
  if (!sequence.length || validateRoundSequence(sequence)) return null;

  const questionIdsByType = await getCompanyQuestionIds(company._id);
  const errors = await validateRoundAvailability(sequence, QUESTION_BANKS, company.name, questionIdsByType);
  return errors.length ? null : sequence;
}

async function companyResponse(company, pattern) {
  const roundSequence = await getCompanyDrive(company, pattern);
  return {
    id: company._id,
    name: company.name,
    description: company.description,
    has_pattern: Boolean(roundSequence),
    round_sequence: roundSequence || [],
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
    const patterns = await CompanyPattern.find({ company: { $in: companies.map((company) => company._id) } });
    const patternByCompany = Object.fromEntries(patterns.map((pattern) => [String(pattern.company), pattern]));
    const result = (await Promise.all(companies.map((company) => (
      companyResponse(company, patternByCompany[String(company._id)])
    )))).filter((company) => company.has_pattern);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching companies" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const pattern = await CompanyPattern.findOne({ company: company._id });
    res.json(await companyResponse(company, pattern));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching company" });
  }
});

module.exports = router;
