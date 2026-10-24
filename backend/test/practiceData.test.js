const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPANIES,
  APTITUDE_QUESTIONS,
  THEORY_QUESTIONS,
  CODING_QUESTIONS,
} = require("../seed/practiceData");

test("practice seed prepares six requested companies without replacing existing data", () => {
  assert.deepEqual(COMPANIES.map(([name]) => name), [
    "Amazon", "TCS", "Infosys", "Wipro", "Accenture", "Cognizant",
  ]);
  assert.ok(COMPANIES.every(([, description]) => description.length > 10));
});

test("practice question fixtures meet the per-company assignment target and required fields", () => {
  assert.equal(APTITUDE_QUESTIONS.length, 10);
  assert.equal(THEORY_QUESTIONS.length, 10);
  assert.equal(CODING_QUESTIONS.length, 5);
  assert.ok(APTITUDE_QUESTIONS.every((question) => (
    question.question_text && question.options.length >= 2
    && question.options.includes(question.correct_option) && question.explanation
  )));
  assert.ok(THEORY_QUESTIONS.every((question) => (
    question.reference_answer && question.marking_rubric.length
    && question.max_marks > 0 && question.ideal_concepts.length
  )));
  assert.ok(CODING_QUESTIONS.every((question) => (
    question.input_format && question.output_format && question.constraints.length
    && question.sample_input && question.sample_output
    && question.test_cases.some((testCase) => !testCase.hidden)
    && question.test_cases.some((testCase) => testCase.hidden)
  )));
});

test("theory fixtures cover each requested computing subject", () => {
  const subjects = new Set(THEORY_QUESTIONS.map((question) => question.subject));
  for (const subject of [
    "Operating Systems",
    "DBMS",
    "Computer Networks",
    "Object-Oriented Programming",
    "Data Structures and Algorithms",
    "Compiler Design",
  ]) {
    assert.ok(subjects.has(subject), `Missing theory subject ${subject}`);
  }
});
