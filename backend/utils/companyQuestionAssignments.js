const CompanyQuestionAssignment = require("../models/CompanyQuestionAssignment");

async function getCompanyQuestionIds(companyId) {
  const assignments = await CompanyQuestionAssignment.find({ company: companyId }).select("round_type question").lean();
  if (!assignments.length) return {};

  const questionIdsByType = {};
  assignments.forEach(({ round_type, question }) => {
    if (!questionIdsByType[round_type]) questionIdsByType[round_type] = [];
    questionIdsByType[round_type].push(question);
  });
  return questionIdsByType;
}

module.exports = { getCompanyQuestionIds };
