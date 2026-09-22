const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');

function parseSkillArray(value) {
  if (!value) {
    return [];
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
      recommended_topics: ['Practice exercises', 'Hands-on projects', 'Focused study plan'],
    }));

    return res.status(200).json(successResponse('Skill gaps retrieved successfully', { skills: generated }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSkillGaps,
};
