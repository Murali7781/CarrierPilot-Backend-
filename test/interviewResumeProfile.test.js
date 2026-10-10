const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createInterviewResumeProfile,
  estimateExperienceYears,
} = require('../src/services/interviewResumeProfile');

test('resume profile extracts all interview-relevant sections without contact details', () => {
  const profile = createInterviewResumeProfile({
    title: 'Senior developer resume',
    professional_summary: 'Engineer at candidate@example.com with a focus on reliable systems.',
    skills: 'JavaScript, React',
    skill_entries: [{ skill_name: 'TypeScript' }],
    experience: JSON.stringify([{ title: 'Software Engineer', company: 'Example', start_date: '2022-01', end_date: '2024-12', description: 'Built services. Call +1 555 123 4567.' }]),
    education: [{ degree: 'BS Computer Science', institution: 'Example University' }],
    projects: [{ name: 'Usage analytics', technologies: 'React, SQL', description: 'Built a reporting tool.' }],
    certifications: [{ name: 'Cloud Practitioner', issuer: 'Example Cloud' }],
    extracted_text: 'Software Engineer. Reach me at candidate@example.com.',
  });

  assert.deepEqual(profile.skills, ['JavaScript', 'React', 'TypeScript']);
  assert.equal(profile.experienceYears, 3);
  assert.match(profile.experienceLevel, /Intermediate/);
  assert.equal(profile.summary.includes('[email]'), true);
  assert.equal(profile.experience[0].title, 'Software Engineer');
  assert.equal(profile.education[0].degree, 'BS Computer Science');
  assert.equal(profile.projects[0].name, 'Usage analytics');
  assert.equal(profile.certifications[0].name, 'Cloud Practitioner');
  assert.doesNotMatch(JSON.stringify(profile), /candidate@example\.com|555 123 4567/);
});

test('experience estimation merges overlapping employment dates and reports unknown dates', () => {
  assert.equal(estimateExperienceYears([
    { start_date: '2020-01', end_date: '2022-12' },
    { start_date: '2022-01', end_date: '2023-12' },
  ]), 4);
  assert.equal(estimateExperienceYears([{ title: 'Engineer' }]), null);
});
