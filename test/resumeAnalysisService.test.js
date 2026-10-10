const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeResume } = require('../src/services/resumeAnalysisService');

test('ATS analysis evaluates structured resume sections and target keywords', () => {
  const result = analyzeResume({
    personal_info: { full_name: 'Taylor Example', email: 'taylor@example.com' },
    professional_summary: 'Software engineer focused on dependable web applications.',
    experience: [{ title: 'Software Engineer', company: 'Example Co', description: 'Built a React application.' }],
    education: [{ degree: 'BS Computer Science', institution: 'Example University' }],
    skills: ['React', 'Node.js'],
    projects: [],
    certifications: [],
  }, 'Build React and Node.js applications with Python experience.');

  assert.ok(result.matchedKeywords.includes('react'));
  assert.ok(result.matchedKeywords.includes('node.js'));
  assert.ok(result.missingKeywords.includes('python'));
  assert.equal(result.checks.find((check) => check.label === 'Contact details').passed, true);
  assert.equal(result.checks.find((check) => check.label === 'Professional summary').passed, true);
  assert.equal(result.checks.find((check) => check.label === 'Work experience').passed, true);
  assert.equal(result.checks.find((check) => check.label === 'Education').passed, true);
  assert.equal(result.checks.find((check) => check.label === 'Skills').passed, true);
});

test('ATS analysis does not award section points to an empty structured resume', () => {
  const result = analyzeResume({}, 'A job description that includes React and collaboration.');

  assert.equal(result.score, 0);
  assert.ok(result.checks.every((check) => check.passed === false));
});
