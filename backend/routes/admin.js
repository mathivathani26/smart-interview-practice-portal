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
const { selectCanonicalDriveConfig } = require("../utils/canonicalDriveConfig");
const { normalizeTags } = require("../utils/codingTags");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");

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

async function getCodingAssignmentErrors(
  questionId,
  { excludeQuestion = false, session, questionOverride } = {}
) {
  let assignmentQuery = CompanyQuestionAssignment.find({
    round_type: "coding",
    question: questionId,
  }).select("company");
  if (session) assignmentQuery = assignmentQuery.session(session);
  const assignments = await assignmentQuery.lean();
  const companyIds = [...new Set(assignments.map((assignment) => String(assignment.company)))];
  const errors = [];

  for (const companyId of companyIds) {
    let companyQuery = Company.findById(companyId);
    let patternQuery = CompanyPattern.findOne({ company: companyId });
    let drivesQuery = MockDrive.find({ company: companyId }).sort({ createdAt: 1, _id: 1 });
    if (session) {
      companyQuery = companyQuery.session(session);
      patternQuery = patternQuery.session(session);
      drivesQuery = drivesQuery.session(session);
    }
    const [company, pattern, drives] = await Promise.all([
      companyQuery,
      patternQuery.lean(),
      drivesQuery.lean(),
    ]);
    if (!company) {
      errors.push(`Coding question ${questionId} is assigned to a missing company record (${companyId}).`);
      continue;
    }
    const config = selectCanonicalDriveConfig(pattern, drives, { includeDraft: true });
    const codingRounds = config.round_sequence.filter(
      (round) => round.round_type === "coding" && round.enabled !== false
    );
    if (!codingRounds.length) continue;

    const questionIdsByType = await getCompanyQuestionIds(company._id, session);
    if (excludeQuestion) {
      questionIdsByType.coding = (questionIdsByType.coding || [])
        .filter((id) => String(id) !== String(questionId));
    }
    errors.push(...await validateRoundAvailability(
      codingRounds,
      { coding: CodingQuestion },
      company.name,
      questionIdsByType,
      session,
      questionOverride
    ));
  }

  return errors;
}

function crudFor(path, Model) {
  router.get(`/${path}`, async (req, res) => {
    const items = await Model.find().sort({ createdAt: -1 });
    res.json(items);
  });
  router.post(`/${path}`, async (req, res) => {
    try {
      const item = await Model.create(normalizeQuestionPayload(Model, req.body));
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });
  router.put(`/${path}/:id`, async (req, res) => {
    try {
      const payload = normalizeQuestionPayload(Model, req.body);
      if (
        Model === CodingQuestion
        && (Object.prototype.hasOwnProperty.call(payload, "difficulty")
          || Object.prototype.hasOwnProperty.call(payload, "tags"))
      ) {
        const assigned = await CompanyQuestionAssignment.find({
          round_type: "coding",
          question: req.params.id,
        }).select("_id").lean();
        if (assigned.length) {
          const current = await Model.findById(req.params.id);
          if (!current) return res.status(404).json({ message: "Not found" });
          const questionOverride = {
            ...current.toObject(),
            ...payload,
            _id: current._id,
          };
          const errors = await getCodingAssignmentErrors(current._id, { questionOverride });
          if (errors.length) {
            return res.status(409).json({ message: errors.join("\n"), errors });
          }
          const filter = current.updatedAt
            ? { _id: req.params.id, updatedAt: current.updatedAt }
            : { _id: req.params.id };
          const item = await Model.findOneAndUpdate(
            filter,
            payload,
            { new: true, runValidators: true }
          );
          if (!item) {
            return res.status(409).json({ message: "The coding question changed during validation. Reload it and try again." });
          }
          return res.json(item);
        }
      }
      const item = await Model.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      );
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });
  router.delete(`/${path}/:id`, async (req, res) => {
    if (Model === CodingQuestion) {
      const errors = await getCodingAssignmentErrors(req.params.id, { excludeQuestion: true });
      if (errors.length) {
        return res.status(409).json({
          message: `Cannot delete this coding question because the change would make a configured company round invalid:\n${errors.join("\n")}`,
          errors,
        });
      }
    }
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (Model === CodingQuestion) {
      try {
        await CompanyQuestionAssignment.deleteMany({
          round_type: "coding",
          question: item._id,
        });
      } catch (err) {
        console.error(
          "Coding question deleted but its company assignment references could not be cleaned up:",
          err.name,
          err.code || ""
        );
        return res.status(500).json({
          message: "Coding question was deleted, but assignment cleanup failed. Review company coding assignments before publishing a round.",
        });
      }
    }
    res.json({ deleted: true });
  });
}

function normalizeQuestionPayload(Model, body) {
  if (Model !== CodingQuestion || !Object.prototype.hasOwnProperty.call(body, "tags")) return body;
  const tags = typeof body.tags === "string"
    ? body.tags.split(/[,;\n]/)
    : body.tags;
  if (!Array.isArray(tags)) throw new Error("Coding question tags must be a list of names.");
  return { ...body, tags: normalizeTags(tags) };
}

crudFor("questions/aptitude", AptitudeQuestion);
crudFor("questions/coding", CodingQuestion);
crudFor("questions/theory", TheoryQuestion);

// Companies + patterns (custom, since a pattern is a nested sub-document)
router.get("/companies", async (req, res) => {
  const companies = await Company.find().sort({ name: 1 });
  const patterns = await CompanyPattern.find({ company: { $in: companies.map((c) => c._id) } });
  const drives = await MockDrive.find({ company: { $in: companies.map((c) => c._id) } }).sort({ createdAt: 1, _id: 1 });
  const patternByCompany = Object.fromEntries(patterns.map((p) => [String(p.company), p]));
  const drivesByCompany = new Map();
  drives.forEach((drive) => {
    const key = String(drive.company);
    if (!drivesByCompany.has(key)) drivesByCompany.set(key, []);
    drivesByCompany.get(key).push(drive);
  });
  res.json(companies.map((c) => {
    const pattern = patternByCompany[String(c._id)];
    const config = selectCanonicalDriveConfig(pattern, drivesByCompany.get(String(c._id)) || [], { includeDraft: true });
    const roundSequence = config.round_sequence.map((round) => (
      typeof round.toObject === "function" ? round.toObject() : round
    ));
    return {
      id: c._id,
      name: c.name,
      description: c.description,
      has_pattern: roundSequence.length > 0,
      round_sequence: roundSequence,
      legacy_config: config.legacy,
      legacy_drive_name: config.legacy_drive_name || null,
      legacy_drive_status: config.legacy_drive_status || null,
      legacy_drive_count: config.legacy_drive_count,
    };
  }));
});

router.post("/companies", async (req, res) => {
  try {
    const { name, description, round_sequence } = req.body;
    if (round_sequence && round_sequence.length > 0) {
      const validationError = validateRoundSequence(round_sequence, { allowLegacy: false });
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
    const validationError = validateRoundSequence(round_sequence, { allowLegacy: false });
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
    const validationError = validateRoundSequence(round_sequence, { allowLegacy: false });
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
