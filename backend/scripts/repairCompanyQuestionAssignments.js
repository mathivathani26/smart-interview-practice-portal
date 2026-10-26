require("dotenv").config();
const mongoose = require("mongoose");
const Company = require("../models/Company");
const CompanyPattern = require("../models/CompanyPattern");
const MockDrive = require("../models/MockDrive");
const AptitudeQuestion = require("../models/AptitudeQuestion");
const CodingQuestion = require("../models/CodingQuestion");
const TheoryQuestion = require("../models/TheoryQuestion");
const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");
const { selectCanonicalDriveConfig } = require("../utils/canonicalDriveConfig");
const {
  findEligibleQuestions,
  getConfiguredDifficultyCounts,
} = require("../utils/companyPattern");

const BACKUP_COLLECTION = "companyquestionassignmentrepairbackups";
const BANK_BY_TYPE = {
  aptitude: AptitudeQuestion,
  coding: CodingQuestion,
  theory: TheoryQuestion,
};
const DIFFICULTIES = [
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
];

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function diagnosisFingerprint(diagnosis) {
  const companies = diagnosis.affectedCompanies
    .map((company) => ({
      ...company,
      existingAssignmentIds: [...company.existingAssignmentIds]
        .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId)),
      staleAssignments: [...company.staleAssignments]
        .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId)),
      duplicateQuestionIds: [...company.duplicateQuestionIds].sort(),
      proposedChanges: [...company.proposedChanges]
        .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId)),
    }))
    .sort((left, right) => left.companyId.localeCompare(right.companyId));
  return JSON.stringify(companies);
}

async function loadCodingRound(companyId, session) {
  const patternQuery = CompanyPattern.findOne({ company: companyId });
  const driveQuery = MockDrive.find({ company: companyId }).sort({ createdAt: 1, _id: 1 });
  const [pattern, drives] = await Promise.all([
    withSession(patternQuery, session).lean(),
    withSession(driveQuery, session).lean(),
  ]);
  const config = selectCanonicalDriveConfig(pattern, drives);
  const rounds = config.round_sequence.filter(
    (round) => round.round_type === "coding" && round.enabled !== false
  );
  return rounds.length === 1 ? rounds[0] : null;
}

async function getEligibleCount(round, difficulty, questionIds, session) {
  return (await findEligibleQuestions(
    CodingQuestion,
    round,
    difficulty,
    questionIds,
    session
  )).length;
}

async function getEligibilityCounts(round, counts, questionIds, session) {
  const result = [];
  for (const [key, label] of DIFFICULTIES) {
    const requested = Number(counts[key] || 0);
    const available = requested
      ? await getEligibleCount(round, key, questionIds, session)
      : 0;
    result.push({
      difficulty: label,
      requested,
      available,
      shortBy: Math.max(0, requested - available),
    });
  }
  return result;
}

async function getShortages(round, counts, questionIds, session) {
  return (await getEligibilityCounts(round, counts, questionIds, session))
    .filter((count) => count.shortBy > 0);
}

async function diagnoseAssignments(session) {
  const assignmentQuery = CompanyQuestionAssignment.find({ round_type: "coding" });
  const assignments = await withSession(assignmentQuery, session).lean();
  const questionIds = [...new Set(assignments.map((assignment) => String(assignment.question)))];
  const questionQuery = questionIds.length
    ? CodingQuestion.find({ _id: { $in: assignments.map((assignment) => assignment.question) } })
      .select("_id title difficulty tags")
    : null;
  const existingQuestions = questionQuery
    ? await withSession(questionQuery, session).lean()
    : [];
  const questionsById = new Map(existingQuestions.map(
    (question) => [String(question._id), question]
  ));
  const staleIds = questionIds.filter((id) => !questionsById.has(id));
  const otherBankMatches = {};

  if (staleIds.length) {
    for (const [bankType, Model] of Object.entries(BANK_BY_TYPE)) {
      if (bankType === "coding") continue;
      const query = Model.find({
        _id: {
          $in: assignments
            .filter((assignment) => staleIds.includes(String(assignment.question)))
            .map((assignment) => assignment.question),
        },
      }).select("_id");
      const matches = await withSession(query, session).lean();
      matches.forEach((question) => {
        otherBankMatches[String(question._id)] = bankType;
      });
    }
  }

  const assignmentsByCompany = new Map();
  for (const assignment of assignments) {
    const companyId = String(assignment.company);
    if (!assignmentsByCompany.has(companyId)) assignmentsByCompany.set(companyId, []);
    assignmentsByCompany.get(companyId).push(assignment);
  }
  const companyIds = [...assignmentsByCompany.keys()].map((id) => new mongoose.Types.ObjectId(id));
  const companyQuery = Company.find({ _id: { $in: companyIds } }).select("_id name");
  const companies = companyIds.length
    ? await withSession(companyQuery, session).lean()
    : [];
  const companyById = new Map(companies.map((company) => [String(company._id), company]));
  const affectedCompanies = [];

  for (const [companyId, companyAssignments] of assignmentsByCompany) {
    const grouped = new Map();
    companyAssignments.forEach((assignment) => {
      const id = String(assignment.question);
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(assignment);
    });
    const duplicates = [...grouped.entries()]
      .filter(([, records]) => records.length > 1)
      .map(([id]) => id);
    const staleAssignments = companyAssignments.filter(
      (assignment) => !questionsById.has(String(assignment.question))
    );
    if (!staleAssignments.length && !duplicates.length) continue;

    const company = companyById.get(companyId);
    const result = {
      company: company ? company.name : "Unknown company",
      companyId,
      existingAssignmentIds: companyAssignments
        .filter((assignment) => questionsById.has(String(assignment.question)))
        .map((assignment) => {
          const question = questionsById.get(String(assignment.question));
          return {
            assignmentId: String(assignment._id),
            questionId: String(assignment.question),
            title: question.title,
            difficulty: question.difficulty,
            tags: question.tags || [],
          };
        }),
      staleAssignments: staleAssignments.map((assignment) => ({
        assignmentId: String(assignment._id),
        questionId: String(assignment.question),
        createdAt: assignment.createdAt || null,
        updatedAt: assignment.updatedAt || null,
        existsInOtherBank: otherBankMatches[String(assignment.question)] || null,
      })),
      duplicateQuestionIds: duplicates,
      codingRound: null,
      proposedChanges: [],
      unresolved: [],
    };

    if (duplicates.length) {
      result.unresolved.push({
        reason: "Duplicate coding assignment rows exist; resolve those rows before repairing this company.",
        questionIds: duplicates,
      });
    }
    if (staleAssignments.length && !duplicates.length) {
      const round = await loadCodingRound(companyId, session);
      const counts = round && getConfiguredDifficultyCounts(round);
      if (!round) {
        result.unresolved.push({
          reason: "No single enabled coding round is configured, so a safe replacement cannot be selected.",
        });
      } else if (!counts) {
        result.unresolved.push({
          reason: "The configured coding round has no usable Easy, Medium, and Hard question counts.",
        });
      } else {
        const assignedIds = companyAssignments
          .filter((assignment) => questionsById.has(String(assignment.question)))
          .map((assignment) => assignment.question);
        result.codingRound = {
          included_topics: round.included_topics || [],
          category: round.category || null,
          difficulty_counts: counts,
          eligibleCountsBefore: await getEligibilityCounts(round, counts, assignedIds, session),
        };
        const simulatedIds = [...assignedIds];
        const proposedChanges = [];

        for (const staleAssignment of staleAssignments) {
          const shortages = await getShortages(round, counts, simulatedIds, session);
          let replacement = null;
          for (const [key] of DIFFICULTIES) {
            if (!shortages.some(
              (shortage) => shortage.difficulty.toLowerCase() === key
            )) continue;
            const candidates = await findEligibleQuestions(
              CodingQuestion,
              round,
              key,
              undefined,
              session
            );
            replacement = candidates.find(
              (candidate) => !simulatedIds.some(
                (assignedId) => String(assignedId) === String(candidate._id)
              )
            ) || null;
            if (replacement) break;
          }

          if (replacement) {
            simulatedIds.push(replacement._id);
            proposedChanges.push({
              action: "replace",
              assignmentId: String(staleAssignment._id),
              oldQuestionId: String(staleAssignment.question),
              replacement: {
                id: String(replacement._id),
                title: replacement.title,
                difficulty: replacement.difficulty,
                tags: replacement.tags || [],
              },
            });
          } else if (shortages.length === 0) {
            proposedChanges.push({
              action: "remove_obsolete_reference",
              assignmentId: String(staleAssignment._id),
              oldQuestionId: String(staleAssignment.question),
            });
          } else {
            result.unresolved.push({
              reason: "No unassigned Coding Question meets the configured difficulty and tag rules.",
              shortages,
            });
          }
        }

        const finalShortages = await getShortages(round, counts, simulatedIds, session);
        result.codingRound.eligibleCountsAfter = await getEligibilityCounts(
          round,
          counts,
          simulatedIds,
          session
        );
        if (finalShortages.length) {
          result.unresolved.push({
            reason: "The coding round would still be short after eligible replacements.",
            shortages: finalShortages,
          });
        }
        result.proposedChanges = result.unresolved.length ? [] : proposedChanges;
      }
    }
    affectedCompanies.push(result);
  }

  return {
    companiesWithInvalidAssignments: affectedCompanies.length,
    affectedCompanies,
    proposedChangeCount: affectedCompanies.reduce(
      (total, company) => total + company.proposedChanges.length,
      0
    ),
  };
}

async function applyRepairs(expectedDiagnosis) {
  const session = await mongoose.startSession();
  let applied = { backupCount: 0, changeCount: 0 };

  try {
    await session.withTransaction(async () => {
      const diagnosis = await diagnoseAssignments(session);
      if (diagnosisFingerprint(diagnosis) !== diagnosisFingerprint(expectedDiagnosis)) {
        throw Object.assign(new Error(), { code: "DIAGNOSIS_CHANGED" });
      }
      const changes = diagnosis.affectedCompanies.flatMap((company) => (
        company.proposedChanges.map((change) => ({ ...change, companyId: company.companyId }))
      ));
      if (!changes.length) return;

      const backupCollection = mongoose.connection.db.collection(BACKUP_COLLECTION);
      const repairRunId = new mongoose.Types.ObjectId();
      const assignmentIds = changes.map(
        (change) => new mongoose.Types.ObjectId(change.assignmentId)
      );
      const originalRecords = await CompanyQuestionAssignment.find({
        _id: { $in: assignmentIds },
      }).session(session).lean();
      const recordsById = new Map(originalRecords.map(
        (record) => [String(record._id), record]
      ));
      const backups = changes.map((change) => ({
        repairRunId,
        assignmentId: new mongoose.Types.ObjectId(change.assignmentId),
        companyId: new mongoose.Types.ObjectId(change.companyId),
        action: change.action,
        oldQuestionId: new mongoose.Types.ObjectId(change.oldQuestionId),
        replacementQuestionId: change.replacement
          ? new mongoose.Types.ObjectId(change.replacement.id)
          : null,
        originalRecord: recordsById.get(change.assignmentId),
        backedUpAt: new Date(),
      }));
      if (backups.some((backup) => !backup.originalRecord)) {
        throw new Error("An assignment changed during diagnosis; no repair was applied.");
      }
      await backupCollection.insertMany(backups, { session });

      for (const change of changes) {
        const filter = {
          _id: new mongoose.Types.ObjectId(change.assignmentId),
          company: new mongoose.Types.ObjectId(change.companyId),
          round_type: "coding",
          question: new mongoose.Types.ObjectId(change.oldQuestionId),
        };
        if (change.action === "replace") {
          const updated = await CompanyQuestionAssignment.updateOne(
            filter,
            { $set: { question: new mongoose.Types.ObjectId(change.replacement.id) } },
            { session }
          );
          if (updated.modifiedCount !== 1) {
            throw new Error("An assignment changed during repair; the transaction was cancelled.");
          }
        } else {
          const removed = await CompanyQuestionAssignment.deleteOne(filter, { session });
          if (removed.deletedCount !== 1) {
            throw new Error("An assignment changed during repair; the transaction was cancelled.");
          }
        }
      }
      applied = { backupCount: backups.length, changeCount: changes.length };
    });
  } finally {
    await session.endSession();
  }
  return applied;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGO_URI;
  if (!uri) throw Object.assign(new Error(), { code: "MONGO_URI_NOT_CONFIGURED" });
  const expectedDatabase = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, ""));
  if (!expectedDatabase) throw Object.assign(new Error(), { code: "DATABASE_NAME_REQUIRED" });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const actualDatabase = mongoose.connection.db.databaseName;
    if (actualDatabase !== expectedDatabase) {
      throw Object.assign(new Error(), { code: "DATABASE_NAME_MISMATCH" });
    }
    const diagnosis = await diagnoseAssignments();
    const report = {
      mode: apply ? "apply" : "dry-run",
      database: actualDatabase,
      collections: {
        codingQuestions: CodingQuestion.collection.name,
        companies: Company.collection.name,
        companyPatterns: CompanyPattern.collection.name,
        mockDrives: MockDrive.collection.name,
        assignments: CompanyQuestionAssignment.collection.name,
        backups: BACKUP_COLLECTION,
      },
      ...diagnosis,
    };
    console.log(JSON.stringify(report, null, 2));

    if (apply) {
      const result = await applyRepairs(diagnosis);
      console.log(JSON.stringify({
        applied: result.changeCount > 0,
        ...result,
        backupCollection: BACKUP_COLLECTION,
      }, null, 2));
    } else {
      console.log("Dry run only. No database records were changed. Use --apply only after reviewing and approving this exact report.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Assignment diagnosis/repair failed:", error.name || "Error", error.code || "");
    mongoose.disconnect().finally(() => {
      process.exitCode = 1;
    });
  });
}

module.exports = { diagnoseAssignments };
