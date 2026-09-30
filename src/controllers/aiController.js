const { generateCareerAdvice } = require('../services/ai/aiService');
const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function chatWithAi(req, res, next) {
  try {
    const { message, history } = req.body || {};

    const normalizedMessage = String(message || '').trim();

    if (!normalizedMessage) {
      return res.status(400).json(errorResponse('Message is required', 400));
    }

    if (normalizedMessage.length > 4000) {
      return res.status(400).json(errorResponse('Message must be 4000 characters or fewer', 400));
    }

    const [preferences, resumes, gaps, applications, jobs] = await Promise.all([
      pool.query('SELECT desired_roles, preferred_locations FROM candidate_preferences WHERE user_id = ? LIMIT 1', [req.user.id]),
      pool.query('SELECT title, skills, professional_summary FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [req.user.id]),
      pool.query("SELECT skill_name, priority FROM skill_gaps WHERE user_id = ? ORDER BY FIELD(LOWER(priority), 'high', 'medium', 'low'), updated_at DESC LIMIT 10", [req.user.id]),
      pool.query('SELECT COUNT(*) AS total FROM applications WHERE user_id = ?', [req.user.id]),
      pool.query("SELECT required_skills FROM job_descriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20", [req.user.id]),
    ]);

    const parsePreference = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    };

    const validHistory = Array.isArray(history)
      ? history.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string')
        .slice(-12)
        .map((item) => ({ role: item.role, text: item.text.slice(0, 4000) }))
      : [];

    const savedGaps = gaps[0];
    const resumeSkills = new Set(parsePreference(resumes[0][0]?.skills).map((skill) => String(skill).trim().toLowerCase()));
    const roleSkills = new Map();
    for (const job of jobs[0]) {
      for (const skill of parsePreference(job.required_skills)) {
        const name = String(skill).trim();
        const normalized = name.toLowerCase();
        if (name && !resumeSkills.has(normalized)) roleSkills.set(normalized, (roleSkills.get(normalized) || { skill_name: name, priority: 'medium', count: 0 }));
        if (roleSkills.has(normalized)) roleSkills.get(normalized).count += 1;
      }
    }
    const derivedGaps = [...roleSkills.values()]
      .sort((a, b) => b.count - a.count || a.skill_name.localeCompare(b.skill_name))
      .slice(0, 10);
    const knownGapNames = new Set(savedGaps.map((gap) => String(gap.skill_name).toLowerCase()));
    const combinedGaps = [...savedGaps, ...derivedGaps.filter((gap) => !knownGapNames.has(gap.skill_name.toLowerCase()))].slice(0, 10);

    const result = await generateCareerAdvice({
      message: normalizedMessage,
      history: validHistory,
      userContext: {
        targetRole: parsePreference(preferences[0][0]?.desired_roles)[0] || '',
        preferredLocation: parsePreference(preferences[0][0]?.preferred_locations)[0] || '',
        resume: resumes[0][0] || null,
        skillGaps: combinedGaps,
        applicationCount: applications[0][0]?.total || 0,
      },
    });

    return res.status(200).json(successResponse('Career coach response generated', {
      response: result.response,
      mode: result.mode,
      status: result.status,
    }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  chatWithAi,
};
