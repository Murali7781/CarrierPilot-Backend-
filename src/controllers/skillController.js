const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');

function parseSkillArray(value) {
  if (!value) {
    return [];
  }

  function learningPlan(skill) {
    const normalized = skill.toLowerCase();
    const plans = {
      react: ['Components and hooks', 'State and data fetching', 'Build an accessible dashboard'],
      javascript: ['Async JavaScript', 'Modern modules', 'Build a small API client'],
      typescript: ['Types and interfaces', 'Generics and utility types', 'Convert a React feature'],
      sql: ['Joins and aggregations', 'Indexes and query plans', 'Answer a business question'],
      figma: ['Auto layout', 'Design tokens', 'Prototype a user flow'],
      python: ['Data structures', 'Functions and testing', 'Automate a useful workflow'],
    };
    return plans[normalized] || ['Learn the core concepts', 'Follow a guided tutorial', 'Build a portfolio project'];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (error) {
      // fallback for comma-delimited values already stored in the database
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

async function getSkillGaps(req, res, next) {
  try {
    const [existing] = await pool.query(
      'SELECT * FROM skill_gaps WHERE user_id = ? ORDER BY priority DESC, created_at DESC',
      [req.user.id],
    );

    if (existing.length > 0) {
      return res.status(200).json(successResponse('Skill gaps retrieved successfully', { skills: existing }));
    }

    const [resumeRows] = await pool.query(
      'SELECT skills FROM resumes WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
    );

    const resumeSkills = resumeRows.flatMap((resume) => parseSkillArray(resume.skills));

    const [jobRows] = await pool.query(
      'SELECT required_skills FROM job_descriptions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
    );

    const jobSkills = jobRows.flatMap((job) => parseSkillArray(job.required_skills));
    const missingSkills = [...new Set(jobSkills.filter((skill) => !resumeSkills.map((item) => item.toLowerCase()).includes(skill.toLowerCase())))];

    const generated = missingSkills.slice(0, 10).map((skill, index) => ({
      skill_name: skill,
      current_level: 'Beginner',
      missing_level: 'Intermediate',
      priority: index === 0 ? 'High' : 'Medium',
      recommended_topics: learningPlan(skill),
      estimated_hours: 8 + index * 2,
      resource_type: 'guided project',
    }));

    return res.status(200).json(successResponse('Skill gaps retrieved successfully', { skills: generated }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSkillGaps,
};
