const { pool } = require('../config/db');

function normalizeSkillList(skills) {
  if (!skills) return [];

  if (Array.isArray(skills)) {
    return skills
      .map((skill) => String(skill).trim())
      .filter(Boolean)
      .map((skill) => skill.toLowerCase());
  }

  if (typeof skills === 'string') {
    return skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)
      .map((skill) => skill.toLowerCase());
  }

  return [];
}

async function getUserResumes(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM resumes WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );

  return rows;
}

async function createResume(userId, payload = {}) {
  const title = String(payload.title || '').trim();

  if (!title) {
    const error = new Error('Resume title is required');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.query(
    `INSERT INTO resumes (user_id, title, personal_info, professional_summary, education, experience, skills, projects, certifications)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      title,
      payload.personal_info ? JSON.stringify(payload.personal_info) : null,
      payload.professional_summary || null,
      payload.education ? JSON.stringify(payload.education) : null,
      payload.experience ? JSON.stringify(payload.experience) : null,
      payload.skills ? JSON.stringify(normalizeSkillList(payload.skills)) : JSON.stringify([]),
      payload.projects ? JSON.stringify(payload.projects) : null,
      payload.certifications ? JSON.stringify(payload.certifications) : null,
    ],
  );

  const [rows] = await pool.query('SELECT * FROM resumes WHERE id = ? LIMIT 1', [result.insertId]);
  const resume = rows[0];

  const skillList = normalizeSkillList(payload.skills || []);
  if (skillList.length > 0) {
    const skillValues = skillList.map((skill) => [result.insertId, skill, 'Intermediate']);
    await pool.query(
      'INSERT INTO resume_skills (resume_id, skill_name, proficiency_level) VALUES ?',
      [skillValues],
    );
  }

  return resume;
}

async function getResumeById(userId, resumeId) {
  const [rows] = await pool.query(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1',
    [resumeId, userId],
  );

  if (!rows.length) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  const [skills] = await pool.query(
    'SELECT * FROM resume_skills WHERE resume_id = ? ORDER BY skill_name ASC',
    [resumeId],
  );

  return {
    ...rows[0],
    skill_entries: skills,
  };
}

async function updateResume(userId, resumeId, payload = {}) {
  const [existing] = await pool.query('SELECT id FROM resumes WHERE id = ? AND user_id = ? LIMIT 1', [resumeId, userId]);

  if (!existing.length) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  const updates = [];
  const values = [];

  if (payload.title !== undefined) {
    updates.push('title = ?');
    values.push(String(payload.title).trim());
  }

  if (payload.personal_info !== undefined) {
    updates.push('personal_info = ?');
    values.push(JSON.stringify(payload.personal_info));
  }

  if (payload.professional_summary !== undefined) {
    updates.push('professional_summary = ?');
    values.push(payload.professional_summary);
  }

  if (payload.education !== undefined) {
    updates.push('education = ?');
    values.push(JSON.stringify(payload.education));
  }

  if (payload.experience !== undefined) {
    updates.push('experience = ?');
    values.push(JSON.stringify(payload.experience));
  }

  if (payload.skills !== undefined) {
    updates.push('skills = ?');
    values.push(JSON.stringify(normalizeSkillList(payload.skills)));
  }

  if (payload.projects !== undefined) {
    updates.push('projects = ?');
    values.push(JSON.stringify(payload.projects));
  }

  if (payload.certifications !== undefined) {
    updates.push('certifications = ?');
    values.push(JSON.stringify(payload.certifications));
  }

  if (!updates.length) {
    const error = new Error('No valid resume fields provided');
    error.statusCode = 400;
    throw error;
  }

  values.push(resumeId, userId);

  await pool.query(
    `UPDATE resumes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    values,
  );

  if (payload.skills !== undefined) {
    await pool.query('DELETE FROM resume_skills WHERE resume_id = ?', [resumeId]);
    const skills = normalizeSkillList(payload.skills);
    if (skills.length > 0) {
      const skillRows = skills.map((skill) => [resumeId, skill, 'Intermediate']);
      await pool.query(
        'INSERT INTO resume_skills (resume_id, skill_name, proficiency_level) VALUES ?',
        [skillRows],
      );
    }
  }

  return getResumeById(userId, resumeId);
}

async function deleteResume(userId, resumeId) {
  const [result] = await pool.query(
    'DELETE FROM resumes WHERE id = ? AND user_id = ?',
    [resumeId, userId],
  );

  if (result.affectedRows === 0) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  return { deleted: true, resume_id: resumeId };
}

module.exports = {
  getUserResumes,
  createResume,
  getResumeById,
  updateResume,
  deleteResume,
  normalizeSkillList,
};
