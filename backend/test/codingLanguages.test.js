const test = require("node:test");
const assert = require("node:assert/strict");
const CodingLanguages = require("../../frontend/js/codingLanguages");
const { LANGUAGE_IDS } = require("../utils/judge0");

test("every selectable language has a matching Judge0 ID and starter template", () => {
  const expectedIds = {
    python3: 71,
    c: 50,
    cpp: 54,
    java: 62,
    javascript: 63,
  };

  assert.deepEqual(
    CodingLanguages.languages.map(({ id }) => id),
    Object.keys(expectedIds)
  );

  for (const language of CodingLanguages.languages) {
    assert.equal(LANGUAGE_IDS[language.id], expectedIds[language.id]);
    assert.match(CodingLanguages.defaultStarterCode[language.id], /TODO/);
  }
});

test("uses the question starter when present and a language template when absent", () => {
  const questionStarter = { python3: "# question-specific starter" };

  assert.equal(
    CodingLanguages.getStarterCode("python3", questionStarter),
    questionStarter.python3
  );
  assert.equal(
    CodingLanguages.getStarterCode("c", questionStarter),
    CodingLanguages.defaultStarterCode.c
  );
  assert.equal(CodingLanguages.getStarterCode("unsupported", questionStarter), "");
});
