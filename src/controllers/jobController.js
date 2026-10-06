const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');
const { getAdzunaConfig, searchAdzunaJobs } = require('../services/jobBoardService');

function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }

function cleanText(value, field, { required = false, max = 1000 } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  const clean = value.trim();
  if (required && !clean) throw badRequest(`${field} is required.`);
  if (clean.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  if (Buffer.byteLength(clean, 'utf8') > 60000) throw badRequest(`${field} exceeds the database text limit.`);
  return clean || null;
}

function normalizeSkills(value, field) {
  if (value == null || value === '') return [];
  if (!Array.isArray(value) && typeof value !== 'string') throw badRequest(`${field} must be a list of skills.`);
  const entries = Array.isArray(value) ? value : value.split(',');
  if (entries.length > 100) throw badRequest(`${field} cannot contain more than 100 skills.`);
  const result = new Map();
  for (const entry of entries) {
    if (typeof entry !== 'string') throw badRequest(`Each item in ${field} must be text.`);
    const skill = entry.trim();
    if (!skill) continue;
    if (skill.length > 100) throw badRequest(`Each item in ${field} must be 100 characters or fewer.`);
    if (!result.has(skill.toLowerCase())) result.set(skill.toLowerCase(), skill);
  }
  return [...result.values()];
}

function cleanHttpUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw badRequest('Job posting URL must be a valid URL under 2,048 characters.');
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch { throw badRequest('Job posting URL must start with http:// or https://.'); }
}

async function storeExternalJobs(userId, country, jobs) {
  if (!jobs.length) return [];

  const values = jobs.map((job) => [
    userId,
    job.title,
    job.company,
    job.description,
    JSON.stringify([]),
    JSON.stringify([]),
    null,
    'adzuna',
    job.sourceJobId,
    country,
    job.location,
    null,
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
    job.employmentType,
    job.applyUrl,
    job.publishedAt,
  ]);

  await pool.query(
    `INSERT INTO job_descriptions
     (user_id, title, company, description, required_skills, preferred_skills, experience_requirements,
      source, source_job_id, source_country, location, work_mode, salary_min, salary_max,
      salary_currency, employment_type, apply_url, published_at, fetched_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE title = VALUES(title), company = VALUES(company),
       description = VALUES(description), location = VALUES(location), salary_min = VALUES(salary_min),
       salary_max = VALUES(salary_max), salary_currency = VALUES(salary_currency),
       employment_type = VALUES(employment_type), apply_url = VALUES(apply_url),
       published_at = VALUES(published_at), fetched_at = CURRENT_TIMESTAMP`,
    [values],
  );

  const externalIds = jobs.map((job) => job.sourceJobId);
  const [rows] = await pool.query(
    `SELECT * FROM job_descriptions
     WHERE user_id = ? AND source = 'adzuna' AND source_country = ? AND source_job_id IN (?)`,
    [userId, country, externalIds],
  );
  const rowByExternalId = new Map(rows.map((row) => [row.source_job_id, row]));
  return jobs.map((job) => rowByExternalId.get(job.sourceJobId)).filter(Boolean);
}

async function listJobs(req, res, next) {
  try {
    const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page, 'page');
    const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit, 'limit');
    if (page > 100000) return res.status(400).json(errorResponse('page must be 100,000 or fewer'));
    if (limit > 100) return res.status(400).json(errorResponse('limit must be 100 or fewer'));
    if (req.query.source === 'adzuna') {
      const providerConfig = getAdzunaConfig();
      if (!providerConfig) {
        const error = new Error('Live job search is not configured.');
        error.statusCode = 503;
        throw error;
      }
      const country = String(req.query.country || providerConfig.country).trim().toLowerCase();
      const result = await searchAdzunaJobs({
        search: req.query.search,
        location: req.query.location,
        page,
        country,
      });
      const jobs = await storeExternalJobs(req.user.id, result.country, result.jobs);
      return res.status(200).json(successResponse('Live job listings retrieved successfully', {
        jobs,
        sourceMode: 'live',
        source: 'Adzuna',
        pagination: { page, limit: 20, total: result.total, totalPages: Math.ceil(result.total / 20) },
      }));
    }
    const where = ['user_id = ?'];
    const values = [req.user.id];
    if (req.query.search !== undefined) {
      const searchText = cleanText(req.query.search, 'search', { max: 100 });
      if (searchText) { where.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)'); const search = `%${searchText}%`; values.push(search, search, search); }
    }
    if (req.query.company !== undefined) {
      const company = cleanText(req.query.company, 'company', { max: 150 });
      if (company) { where.push('company = ?'); values.push(company); }
    }
    const whereSql = where.join(' AND ');
    const offset = (page - 1) * limit;
    const [rows, countRows] = await Promise.all([
      pool.query(`SELECT id, user_id, title, company, description, required_skills, preferred_skills, experience_requirements, location, source_url, created_at, updated_at FROM job_descriptions WHERE ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM job_descriptions WHERE ${whereSql}`, values),
    ]);
    const total = Number(countRows[0][0].total) || 0;
    return res.status(200).json(successResponse('Job descriptions retrieved successfully', { jobs: rows[0], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }));
  } catch (error) { return next(error); }
}

async function createJob(req, res, next) {
  try {
    const body = req.body || {};
    const title = cleanText(body.title, 'Job title', { required: true, max: 150 });
    const description = cleanText(body.description, 'Job description', { required: true, max: 15000 });
    const company = cleanText(body.company, 'Company', { max: 150 });
    const experience = cleanText(body.experience_requirements, 'Experience requirements', { max: 1000 });
    const location = cleanText(body.location, 'Location', { max: 200 });
    const sourceUrl = cleanHttpUrl(body.source_url);
    const requiredSkills = normalizeSkills(body.required_skills, 'required_skills');
    const preferredSkills = normalizeSkills(body.preferred_skills, 'preferred_skills');
    const [result] = await pool.query(
      `INSERT INTO job_descriptions (user_id, title, company, description, required_skills, preferred_skills, experience_requirements, location, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, company, description, JSON.stringify(requiredSkills), JSON.stringify(preferredSkills), experience, location, sourceUrl],
    );
    const [rows] = await pool.query('SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [result.insertId, req.user.id]);
    return res.status(201).json(successResponse('Job description created successfully', { job: rows[0] }));
  } catch (error) { return next(error); }
}

async function getJob(req, res, next) {
  try {
    const id = positiveInteger(req.params.id, 'job id');
    const [rows] = await pool.query(
      `SELECT j.*,
              (SELECT sj.id FROM saved_jobs sj WHERE sj.job_id = j.id AND sj.user_id = ? LIMIT 1) AS saved_job_id,
              (SELECT a.id FROM applications a WHERE a.job_id = j.id AND a.user_id = ? LIMIT 1) AS application_id,
              (SELECT a.status FROM applications a WHERE a.job_id = j.id AND a.user_id = ? LIMIT 1) AS application_status
       FROM job_descriptions j WHERE j.id = ? AND j.user_id = ? LIMIT 1`,
      [req.user.id, req.user.id, req.user.id, id, req.user.id],
    );
    if (!rows.length) return res.status(404).json(errorResponse('Job description not found'));
    return res.status(200).json(successResponse('Job description retrieved successfully', { job: rows[0] }));
  } catch (error) { return next(error); }
}

async function updateJob(req, res, next) {
  try {
    const id = positiveInteger(req.params.id, 'job id');
    const body = req.body || {};
    const updates = [];
    const values = [];
    const textFields = { title: ['title', 150], company: ['Company', 150], description: ['Job description', 15000], experience_requirements: ['Experience requirements', 1000], location: ['Location', 200] };
    for (const [field, [label, max]] of Object.entries(textFields)) {
      if (body[field] === undefined) continue;
      const value = cleanText(body[field], label, { required: field === 'title' || field === 'description', max });
      updates.push(`${field} = ?`); values.push(value);
    }
    for (const [field, label] of [['required_skills', 'Required skills'], ['preferred_skills', 'Preferred skills']]) {
      if (body[field] === undefined) continue;
      updates.push(`${field} = ?`); values.push(JSON.stringify(normalizeSkills(body[field], label)));
    }
    if (body.source_url !== undefined) { updates.push('source_url = ?'); values.push(cleanHttpUrl(body.source_url)); }
    if (!updates.length) return res.status(400).json(errorResponse('Provide at least one job field to update'));
    values.push(id, req.user.id);
    const [result] = await pool.query(`UPDATE job_descriptions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values);
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [id, req.user.id]);
      if (!existing.length) return res.status(404).json(errorResponse('Job description not found'));
    }
    const [rows] = await pool.query('SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [id, req.user.id]);
    return res.status(200).json(successResponse('Job description updated successfully', { job: rows[0] }));
  } catch (error) { return next(error); }
}

async function deleteJob(req, res, next) {
  try {
    const id = positiveInteger(req.params.id, 'job id');
    const [result] = await pool.query('DELETE FROM job_descriptions WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json(errorResponse('Job description not found'));
    return res.status(200).json(successResponse('Job description deleted successfully', { deleted: true }));
  } catch (error) { return next(error); }
}

module.exports = { listJobs, createJob, getJob, updateJob, deleteJob };
