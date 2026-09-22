const { pool } = require('../config/db');

function normalizeSkills(skills) {
  if (!skills) return [];

  const source = Array.isArray(skills) ? skills : String(skills).split(',');

  return source
    .map((skill) => String(skill).trim().toLowerCase())
    .filter(Boolean);
}

async function analyzeResumeAgainstJob({ userId, resumeId, jobId }) {
  if (!resumeId || !jobId) {
    const error = new Error('resumeId and jobId are required');
    error.statusCode = 400;
    throw error;
  }

  const [resumeRows] = await pool.query(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1',
    [resumeId, userId],
  );

  const [jobRows] = await pool.query(
    'SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1',
    [jobId, userId],
  );

  if (!resumeRows.length) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  if (!jobRows.length) {
    const error = new Error('Job description not found');
    error.statusCode = 404;
    throw error;
  }

  const resumeSkills = normalizeSkills(resumeRows[0].skills);
  const requiredSkills = normalizeSkills(jobRows[0].required_skills);
  const preferredSkills = normalizeSkills(jobRows[0].preferred_skills);

  const matchingSkills = [...new Set(requiredSkills.filter((skill) => resumeSkills.includes(skill)))];
  const missingSkills = [...new Set(requiredSkills.filter((skill) => !resumeSkills.includes(skill)))];
  const partialSkills = [...new Set(preferredSkills.filter((skill) => resumeSkills.includes(skill) && !matchingSkills.includes(skill)))];

  const totalSkills = requiredSkills.length || 1;
  const matchPercentage = Math.min(100, Math.max(0, Math.round((matchingSkills.length / totalSkills) * 100)));

  const recommendations = missingSkills.length
    ? [
        `Learn ${missingSkills.slice(0, 3).join(', ')} to improve your fit for this role.`,
        'Update your resume to highlight relevant project work and measurable outcomes.',
      ]
    : [
        'Your current resume aligns closely with this role. Consider tailoring the summary for a stronger match.',
      ];

  const [result] = await pool.query(
    `INSERT INTO job_matches (user_id, resume_id, job_id, match_percentage, matching_skills, missing_skills, partial_skills, recommendations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      resumeId,
      jobId,
      matchPercentage,
      JSON.stringify(matchingSkills),
      JSON.stringify(missingSkills),
      JSON.stringify(partialSkills),
      JSON.stringify(recommendations),
    ],
  );

  return {
    id: result.insertId,
    matchPercentage,
    matchingSkills,
    missingSkills,
    partialSkills,
    recommendations,
  };
}

module.exports = {
  analyzeResumeAgainstJob,
};
