const { pool } = require('../config/db');

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return value.split(',').map((item) => item.trim()).filter(Boolean); }
}

async function getUserSkillGaps(userId, limit = 20) {
  const [matches] = await pool.query(
    `SELECT jm.id AS match_id, jm.job_id, jm.resume_id, jm.missing_skills, jm.match_percentage, jm.created_at,
            j.title AS role_title, r.title AS resume_title
     FROM job_matches jm
     LEFT JOIN job_descriptions j ON j.id = jm.job_id
     LEFT JOIN resumes r ON r.id = jm.resume_id
     WHERE jm.user_id = ? ORDER BY jm.created_at DESC, jm.id DESC LIMIT ?`,
    [userId, limit],
  );
  const seen = new Set();
  const skills = [];
  for (const match of matches) {
    for (const rawSkill of parseList(match.missing_skills)) {
      if (typeof rawSkill !== 'string' || !rawSkill.trim()) continue;
      const skillName = rawSkill.trim();
      const key = `${match.job_id || 'deleted'}:${skillName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push({
        id: `${match.match_id}-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        skill_name: skillName,
        job_id: match.job_id,
        role_title: match.role_title || 'Removed role',
        resume_title: match.resume_title || 'Removed resume',
        match_percentage: Number(match.match_percentage) || 0,
        compared_at: match.created_at,
      });
      if (skills.length >= limit) return skills;
    }
  }
  return skills;
}

module.exports = { getUserSkillGaps };
