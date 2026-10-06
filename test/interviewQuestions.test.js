const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateInterviewQuestions,
  localInterviewQuestions,
  validateInterviewQuestions,
} = require('../src/services/ai/aiService');

const silentLogger = { error() {}, log() {} };

function makeQuestions() {
  return Array.from({ length: 15 }, (_, index) => ({
    question: `For a React Developer, how would you explain distinct interview topic ${index + 1} and validate your approach?`,
    category: ['Technical', 'Scenario', 'Coding', 'Job Description', 'Behavioral'][index % 5],
    type: ['Conceptual', 'Scenario', 'Coding', 'Debugging', 'Behavioral'][index % 5],
    difficulty: ['Basic', 'Intermediate', 'Scenario-based', 'Advanced'][Math.min(3, Math.floor(index / 4))],
    skills: ['React', 'JavaScript'],
  }));
}

test('AI interview generation requests schema-constrained role and resume-aware 15 question output', async () => {
  let request;
  const result = await generateInterviewQuestions({
    userId: 17,
    type: 'mixed',
    roleTitle: 'React Developer',
    jobDescription: 'Build React dashboards and integrate REST APIs.',
    requiredSkills: ['React', 'REST APIs'],
    preferredSkills: ['TypeScript'],
    resumeSkills: ['JavaScript'],
    previousQuestions: ['How do you explain hooks?'],
  }, {
    model: 'gpt-6-luna',
    client: { responses: { create: async (options) => { request = options; return { output_text: JSON.stringify({ questions: makeQuestions() }) }; } } },
    logger: silentLogger,
  });

  assert.equal(result.mode, 'openai');
  assert.equal(result.questions.length, 15);
  assert.deepEqual(Object.keys(result.questions[0]), ['question', 'category', 'type', 'difficulty', 'skills']);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.properties.questions.minItems, 15);
  assert.match(request.input, /React Developer/);
  assert.match(request.input, /REST APIs/);
  assert.match(request.input, /How do you explain hooks/);
});

test('local fallback creates 15 distinct role-aware questions and avoids recent questions', () => {
  const context = {
    type: 'mixed',
    roleTitle: 'React Developer',
    requiredSkills: ['React', 'JavaScript'],
    resumeSkills: ['TypeScript'],
    experience: [{ title: 'CareerPilot dashboard project' }],
  };
  const first = localInterviewQuestions(context);
  const second = localInterviewQuestions({ ...context, previousQuestions: first.questions.slice(0, 8).map((item) => item.question) });
  const normalized = first.questions.map((item) => item.question.toLowerCase());

  assert.equal(first.questions.length, 15);
  assert.equal(new Set(normalized).size, 15);
  assert.ok(first.questions.every((item) => item.category && item.type && item.difficulty && Array.isArray(item.skills)));
  assert.ok(first.questions.some((item) => /React Developer|React|JavaScript/.test(item.question)));
  assert.equal(second.questions.length, 15);
  assert.equal(second.questions.filter((item) => first.questions.slice(0, 8).some((previous) => previous.question === item.question)).length, 0);
  assert.match(first.notice, /not an OpenAI-generated set/i);
});

test('question validation rejects duplicate, malformed, and undersized AI question sets', () => {
  const valid = makeQuestions();
  assert.equal(validateInterviewQuestions({ questions: valid }).length, 15);
  assert.equal(validateInterviewQuestions({ questions: valid.slice(0, 5) }), null);
  assert.equal(validateInterviewQuestions({ questions: [...valid.slice(0, 14), valid[0]] }), null);
  assert.equal(validateInterviewQuestions({ questions: valid.map((item, index) => index === 4 ? { ...item, difficulty: 'Impossible' } : item) }), null);
});

test('malformed AI output falls back safely without exposing provider details', async () => {
  const result = await generateInterviewQuestions({ type: 'technical', roleTitle: 'Node.js Developer', requiredSkills: ['Node.js', 'SQL'] }, {
    model: 'gpt-6-luna',
    client: { responses: { create: async () => ({ output_text: '{ not valid JSON' }) } },
    logger: silentLogger,
  });
  assert.equal(result.mode, 'local');
  assert.equal(result.questions.length, 15);
  assert.doesNotMatch(result.notice, /api key|stack|provider message/i);
});

test('provider quota failures return a labeled role-aware fallback and log only sanitized fields', async () => {
  const logged = [];
  const providerError = new Error('Do not log this raw provider text or credentials.');
  providerError.status = 429;
  providerError.error = { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'private detail' };
  const result = await generateInterviewQuestions({ type: 'technical', roleTitle: 'QA Test Engineer', requiredSkills: ['Postman', 'SQL'] }, {
    model: 'gpt-6-luna',
    client: { responses: { create: async () => { throw providerError; } } },
    logger: { error: (...args) => logged.push(args) },
  });

  assert.equal(result.mode, 'local');
  assert.equal(result.questions.length, 15);
  assert.match(result.notice, /role-aware fallback/i);
  assert.doesNotMatch(result.notice, /credit_balance_exhausted|private detail|credentials/i);
  assert.equal(logged.length, 1);
  assert.deepEqual(logged[0][1], { status: 429, type: 'insufficient_quota', code: 'credit_balance_exhausted' });
});
