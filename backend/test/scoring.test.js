const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreTheoryAnswer } = require('../utils/scoring');

test('correct theory answer scores highly', () => {
  const result = scoreTheoryAnswer(
    'Process scheduling decides which process runs next and shares CPU time fairly among processes. It also handles context switching between tasks.',
    ['process scheduling', 'cpu time sharing', 'context switching']
  );

  assert.ok(result.score >= 70, `Expected high score, received ${result.score}`);
  assert.equal(result.status, 'correct');
});

test('partial theory answer scores moderately', () => {
  const result = scoreTheoryAnswer(
    'The operating system manages memory and uses cache replacement in execution.',
    ['memory management', 'cache replacement', 'page fault handling']
  );

  assert.ok(result.score >= 25 && result.score < 65, `Unexpected partial score ${result.score}`);
  assert.equal(result.status, 'partial');
});

test('irrelevant answer scores low', () => {
  const result = scoreTheoryAnswer(
    'The sky is blue and the weather is warm today.',
    ['process scheduling', 'memory management', 'paging']
  );

  assert.ok(result.score < 35, `Expected low score for irrelevant answer, received ${result.score}`);
  assert.equal(result.status, 'incorrect');
});

test('empty answer scores zero', () => {
  const result = scoreTheoryAnswer('', ['process scheduling', 'memory management']);
  assert.equal(result.score, 0);
  assert.equal(result.status, 'empty');
});

test('keyword-heavy but contradictory answer is not considered correct', () => {
  const result = scoreTheoryAnswer(
    'Process scheduling is not used for CPU time sharing and it is wrong to schedule processes in an operating system.',
    ['process scheduling', 'cpu time sharing', 'context switching']
  );

  assert.ok(result.score < 60, `Expected contradiction penalty, received ${result.score}`);
  assert.notEqual(result.status, 'correct');
});

test('uses reference answer and rubric while returning validated marks and feedback', () => {
  const result = scoreTheoryAnswer(
    'TCP provides ordered reliable delivery and uses acknowledgements to recover lost data, while UDP sends datagrams without guaranteeing delivery.',
    ['reliable TCP delivery', 'UDP datagrams'],
    {
      questionText: 'Compare TCP and UDP.',
      referenceAnswer: 'TCP provides ordered reliable delivery using acknowledgements and retransmissions. UDP sends datagrams without guaranteeing order or delivery.',
      markingRubric: ['Explains TCP reliable ordered delivery', 'Explains UDP datagrams and lack of delivery guarantee'],
      maxMarks: 8,
    }
  );

  assert.equal(result.maxMarks, 8);
  assert.ok(result.marksAwarded >= 0 && result.marksAwarded <= result.maxMarks);
  assert.ok(['correct', 'partial', 'incorrect'].includes(result.status));
  assert.equal(typeof result.feedback, 'string');
  assert.notEqual(result.referenceScore, null);
});
