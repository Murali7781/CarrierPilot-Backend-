const { pool } = require("../config/db");

const entryFields = {
  experience: {
    title: 160,
    company: 160,
    location: 160,
    start_date: 16,
    end_date: 16,
    description: 4000,
  },
  education: {
    degree: 200,
    institution: 200,
    location: 160,
    start_date: 16,
    end_date: 16,
    details: 3000,
  },
  projects: { name: 180, link: 500, technologies: 500, description: 3000 },
  certifications: {
    name: 200,
    issuer: 200,
    issue_date: 16,
    credential_url: 500,
  },
};

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeSkillList(skills) {
  if (skills == null || skills === "") return [];
  if (!Array.isArray(skills) && typeof skills !== "string")
    throw invalid("Skills must be a comma-separated string or a list.");
  const source = Array.isArray(skills) ? skills : skills.split(",");
  if (source.length > 50)
    throw invalid("A resume can include at most 50 skills.");
  const unique = new Map();
  for (const skill of source) {
    if (typeof skill !== "string") throw invalid("Each skill must be text.");
    const clean = skill.trim();
    if (!clean) continue;
    if (clean.length > 100)
      throw invalid("Each skill must be 100 characters or fewer.");
    if (!unique.has(clean.toLowerCase()))
      unique.set(clean.toLowerCase(), clean);
  }
  return [...unique.values()];
}

function normalizeEntryList(value, section) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw invalid(`${section} must be a list.`);
  if (value.length > 30)
    throw invalid(`A resume can include at most 30 ${section} entries.`);
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw invalid(`Each ${section} entry must be an object.`);
    const normalized = {};
    for (const [field, maxLength] of Object.entries(entryFields[section])) {
      const valueForField = entry[field];
      if (valueForField == null || valueForField === "") {
        normalized[field] = "";
        continue;
      }
      if (typeof valueForField !== "string")
        throw invalid(`${field} in ${section} must be text.`);
      const clean = valueForField.trim();
      if (clean.length > maxLength)
        throw invalid(
          `${field} in ${section} must be ${maxLength} characters or fewer.`,
        );
      normalized[field] = clean;
    }
    return normalized;
  });
}

function normalizePersonalInfo(value) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw invalid("Contact details must be an object.");
  const limits = {
    full_name: 120,
    name: 120,
    email: 255,
    phone: 30,
    mobile: 30,
    location: 160,
    linkedin: 500,
    portfolio: 500,
  };
  const cleanInfo = {};
  for (const [field, maxLength] of Object.entries(limits)) {
    if (value[field] == null || value[field] === "") continue;
    if (typeof value[field] !== "string")
      throw invalid(`${field} must be text.`);
    const clean = value[field].trim();
    if (clean.length > maxLength)
      throw invalid(`${field} must be ${maxLength} characters or fewer.`);
    cleanInfo[field] = clean;
  }
  if (cleanInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanInfo.email))
    throw invalid("Resume contact email must be valid.");
  for (const field of ["linkedin", "portfolio"]) {
    if (!cleanInfo[field]) continue;
    try {
      if (!["http:", "https:"].includes(new URL(cleanInfo[field]).protocol))
        throw new Error();
    } catch {
      throw invalid(`${field} must be a valid http or https URL.`);
    }
  }
  return cleanInfo;
}

function normalizeResumePayload(payload = {}, { creating = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw invalid("Resume data must be an object.");
  const normalized = {};
  if (creating || payload.title !== undefined) {
    if (typeof payload.title !== "string" || !payload.title.trim())
      throw invalid("Resume title is required.");
    normalized.title = payload.title.trim();
    if (normalized.title.length > 150)
      throw invalid("Resume title must be 150 characters or fewer.");
  }
  if (payload.target_role !== undefined) {
    if (payload.target_role != null && typeof payload.target_role !== "string")
      throw invalid("Target role must be text.");
    normalized.target_role =
      String(payload.target_role || "")
        .trim()
        .slice(0, 150) || null;
  }
  if (payload.personal_info !== undefined || creating) {
    normalized.personal_info = normalizePersonalInfo(payload.personal_info);
    if (
      creating &&
      !(normalized.personal_info.full_name || normalized.personal_info.name)
    )
      throw invalid("Full name is required in resume contact details.");
    if (creating && !normalized.personal_info.email)
      throw invalid("Email is required in resume contact details.");
  }
  if (payload.professional_summary !== undefined || creating) {
    if (
      payload.professional_summary != null &&
      typeof payload.professional_summary !== "string"
    )
      throw invalid("Professional summary must be text.");
    normalized.professional_summary = String(
      payload.professional_summary || "",
    ).trim();
    if (normalized.professional_summary.length > 5000)
      throw invalid("Professional summary must be 5,000 characters or fewer.");
  }
  for (const section of Object.keys(entryFields)) {
    if (payload[section] !== undefined || creating)
      normalized[section] = normalizeEntryList(payload[section], section);
  }
  if (payload.skills !== undefined || creating)
    normalized.skills = normalizeSkillList(payload.skills);
  return normalized;
}

async function getUserResumes(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id, r.title, r.target_role, r.personal_info, r.professional_summary, r.education, r.experience,
            r.skills, r.projects, r.certifications, r.original_file_name, r.source_file_name, r.file_size, r.created_at, r.updated_at,
            (SELECT ra.score FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_score,
            (SELECT ra.target_role FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_role,
            (SELECT ra.created_at FROM resume_analyses ra WHERE ra.resume_id = r.id AND ra.user_id = r.user_id ORDER BY ra.created_at DESC, ra.id DESC LIMIT 1) AS ats_analyzed_at
     FROM resumes r WHERE r.user_id = ? ORDER BY r.updated_at DESC, r.id DESC`,
    [userId],
  );
  return rows;
}

async function getResumeById(userId, resumeId) {
  const [rows] = await pool.query(
    "SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1",
    [resumeId, userId],
  );
  if (!rows.length) {
    const error = new Error("Resume not found");
    error.statusCode = 404;
    throw error;
  }
  const [skills] = await pool.query(
    "SELECT id, skill_name, proficiency_level FROM resume_skills WHERE resume_id = ? ORDER BY skill_name ASC",
    [resumeId],
  );
  return { ...rows[0], skill_entries: skills };
}

async function getResumeFile(userId, resumeId) {
  const [rows] = await pool.query(
    "SELECT file_path, original_file_name, file_size FROM resumes WHERE id = ? AND user_id = ? LIMIT 1",
    [resumeId, userId],
  );
  if (!rows.length) {
    const error = new Error("Resume not found");
    error.statusCode = 404;
    throw error;
  }
  if (!rows[0].file_path) {
    const error = new Error("No PDF is attached to this resume");
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

async function syncResumeSkills(connection, resumeId, skills) {
  await connection.query("DELETE FROM resume_skills WHERE resume_id = ?", [
    resumeId,
  ]);
  if (skills.length) {
    await connection.query(
      "INSERT INTO resume_skills (resume_id, skill_name, proficiency_level) VALUES ?",
      [skills.map((skill) => [resumeId, skill, "Intermediate"])],
    );
  }
}

async function createResume(userId, payload = {}, file = null) {
  const data = normalizeResumePayload(payload, { creating: true });
  const connection = await pool.getConnection();
  let resumeId;
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.query(
      `INSERT INTO resumes (user_id, title, target_role, personal_info, professional_summary, education, experience, skills, projects, certifications, file_path, original_file_name, file_size, extracted_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.title,
        data.target_role || null,
        JSON.stringify(data.personal_info),
        data.professional_summary || null,
        JSON.stringify(data.education),
        JSON.stringify(data.experience),
        JSON.stringify(data.skills),
        JSON.stringify(data.projects),
        JSON.stringify(data.certifications),
        file?.filePath || null,
        file?.originalFileName || null,
        file?.fileSize || null,
        file?.extractedText || null,
      ],
    );
    resumeId = result.insertId;
    if (data.skills.length)
      await syncResumeSkills(connection, resumeId, data.skills);
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getResumeById(userId, resumeId);
}

async function createImportedResume(
  userId,
  { payload, sourceFileName, extractedText },
) {
  const data = normalizeResumePayload(payload, { creating: true });
  const connection = await pool.getConnection();
  let resumeId;
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.query(
      `INSERT INTO resumes (user_id, title, personal_info, professional_summary, education, experience, skills, projects, certifications, source_file_name, extracted_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.title,
        JSON.stringify(data.personal_info),
        data.professional_summary || null,
        JSON.stringify(data.education),
        JSON.stringify(data.experience),
        JSON.stringify(data.skills),
        JSON.stringify(data.projects),
        JSON.stringify(data.certifications),
        sourceFileName,
        extractedText,
      ],
    );
    resumeId = result.insertId;
    if (data.skills.length)
      await syncResumeSkills(connection, resumeId, data.skills);
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getResumeById(userId, resumeId);
}

async function updateResume(userId, resumeId, payload = {}, file = null) {
  const data = normalizeResumePayload(payload);
  const updates = [];
  const values = [];
  const jsonColumns = [
    "personal_info",
    "education",
    "experience",
    "skills",
    "projects",
    "certifications",
  ];
  for (const [field, value] of Object.entries(data)) {
    updates.push(`${field} = ?`);
    values.push(
      jsonColumns.includes(field) ? JSON.stringify(value) : value || null,
    );
  }
  if (file) {
    updates.push(
      "file_path = ?",
      "original_file_name = ?",
      "file_size = ?",
      "extracted_text = ?",
    );
    values.push(
      file.filePath,
      file.originalFileName,
      file.fileSize,
      file.extractedText,
    );
  }
  if (!updates.length) throw invalid("No valid resume fields provided.");

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [existing] = await connection.query(
      "SELECT id FROM resumes WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
      [resumeId, userId],
    );
    if (!existing.length) {
      const error = new Error("Resume not found");
      error.statusCode = 404;
      throw error;
    }
    values.push(resumeId, userId);
    await connection.query(
      `UPDATE resumes SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      values,
    );
    if (data.skills !== undefined)
      await syncResumeSkills(connection, resumeId, data.skills);
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getResumeById(userId, resumeId);
}

async function deleteResume(userId, resumeId) {
  const [rows] = await pool.query(
    "SELECT file_path FROM resumes WHERE id = ? AND user_id = ? LIMIT 1",
    [resumeId, userId],
  );
  if (!rows.length) {
    const error = new Error("Resume not found");
    error.statusCode = 404;
    throw error;
  }
  const [result] = await pool.query(
    "DELETE FROM resumes WHERE id = ? AND user_id = ?",
    [resumeId, userId],
  );
  if (!result.affectedRows) {
    const error = new Error("Resume not found");
    error.statusCode = 404;
    throw error;
  }
  return {
    deleted: true,
    resume_id: resumeId,
    removedFilePath: rows[0].file_path,
  };
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
  createImportedResume,
  getResumeById,
  getResumeFile,
  updateResume,
  deleteResume,
  normalizeSkillList,
  normalizeResumePayload,
  toPublicResume,
};
