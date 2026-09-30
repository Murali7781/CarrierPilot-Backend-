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
    `SELECT r.id, r.user_id, r.title, r.target_role, r.personal_info, r.professional_summary, r.education, r.experience,
            r.skills, r.projects, r.certifications, r.original_file_name, r.file_size, r.created_at, r.updated_at,
            (SELECT ra.score FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_score,
            (SELECT ra.target_role FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_role,
            (SELECT ra.created_at FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_analyzed_at
     FROM resumes r WHERE r.user_id = ? ORDER BY r.created_at DESC`,
    [userId],
  );

  return rows;
}

async function createResume(userId, payload = {}, file = null) {
  const title = String(payload.title || '').trim();

  if (!title) {
    const error = new Error('Resume title is required');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.query(
    `INSERT INTO resumes
     (user_id, title, target_role, personal_info, professional_summary, education, experience, skills, projects, certifications,
      file_path, original_file_name, file_size, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      title,
      payload.target_role ? String(payload.target_role).trim() : null,
      payload.personal_info ? JSON.stringify(payload.personal_info) : null,
      payload.professional_summary || null,
      payload.education ? JSON.stringify(payload.education) : null,
      payload.experience ? JSON.stringify(payload.experience) : null,
      payload.skills ? JSON.stringify(normalizeSkillList(payload.skills)) : JSON.stringify([]),
      payload.projects ? JSON.stringify(payload.projects) : null,
      payload.certifications ? JSON.stringify(payload.certifications) : null,
      file?.filePath || null,
      file?.originalFileName || null,
      file?.fileSize || null,
      file?.extractedText || null,
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

async function getResumeFile(userId, resumeId) {
  const [rows] = await pool.query(
    `SELECT file_path, original_file_name, file_size
     FROM resumes WHERE id = ? AND user_id = ? LIMIT 1`,
    [resumeId, userId],
  );

  if (!rows.length) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  if (!rows[0].file_path) {
    const error = new Error('No PDF is attached to this resume');
    error.statusCode = 404;
    throw error;
  }

  return rows[0];
}

async function updateResume(userId, resumeId, payload = {}, file = null) {
  const [existing] = await pool.query(
    'SELECT id FROM resumes WHERE id = ? AND user_id = ? LIMIT 1',
    [resumeId, userId],
  );

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

  if (payload.target_role !== undefined) {
    updates.push('target_role = ?');
    values.push(payload.target_role ? String(payload.target_role).trim() : null);
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

  if (file) {
    updates.push('file_path = ?', 'original_file_name = ?', 'file_size = ?', 'extracted_text = ?');
    values.push(file.filePath, file.originalFileName, file.fileSize, file.extractedText);
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
  const [rows] = await pool.query(
    'SELECT file_path FROM resumes WHERE id = ? AND user_id = ? LIMIT 1',
    [resumeId, userId],
  );

  if (!rows.length) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  const [result] = await pool.query(
    'DELETE FROM resumes WHERE id = ? AND user_id = ?',
    [resumeId, userId],
  );

  if (result.affectedRows === 0) {
    const error = new Error('Resume not found');
    error.statusCode = 404;
    throw error;
  }

  return { deleted: true, resume_id: resumeId, removedFilePath: rows[0].file_path };
}

function toPublicResume(resume) {
  if (!resume) return resume;
  const publicResume = { ...resume };
  delete publicResume.file_path;
  delete publicResume.extracted_text;
  return publicResume;
}

module.exports = {
  getUserResumes,
  createResume,
  getResumeById,
  getResumeFile,
  updateResume,
  deleteResume,
  normalizeSkillList,
  toPublicResume,
};
