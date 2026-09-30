const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { getAdzunaConfig, searchAdzunaJobs } = require('../services/jobBoardService');

const starterJobs = [
  ['Frontend Engineer', 'Northstar Labs', 'Build and maintain responsive, accessible web experiences with React and modern JavaScript. Partner with product designers and backend engineers to turn requirements into reusable UI, integrate APIs, write component and browser tests, investigate production issues, and improve page performance. Required: React, JavaScript, HTML, CSS, accessibility, API integration, Git, and testing. Preferred: TypeScript and design systems.', ['React', 'JavaScript', 'HTML', 'CSS', 'Accessibility', 'Testing'], ['TypeScript', 'Design systems'], '2+ years'],
  ['Product Designer', 'Orbit Studio', 'Lead product design from early discovery through detailed delivery. Interview users, map workflows, create wireframes and interactive prototypes, test concepts, maintain accessible design patterns, and work with engineers through implementation. Required: Figma, user research, interaction design, prototyping, accessibility, and communication. Preferred: design systems and usability testing.', ['Figma', 'UX research', 'Interaction design', 'Prototyping', 'Accessibility'], ['Design systems', 'Usability testing'], '2+ years'],
  ['Backend Developer', 'SignalWorks', 'Design, implement, and operate dependable Node.js services and APIs. Model relational data, apply authentication and validation, write automated tests, review changes, monitor service health, and work with frontend and product teams. Required: Node.js, API design, SQL, authentication, testing, Git, and debugging. Preferred: Docker and cloud deployment.', ['Node.js', 'API design', 'SQL', 'Authentication', 'Testing'], ['Docker', 'Cloud'], '1+ year'],
  ['Data Analyst', 'Greenline Mobility', 'Analyze operational and product data to help teams make better decisions. Write documented SQL, validate data quality, build clear dashboards, investigate changes in key measures, and present practical findings to non-technical partners. Required: SQL, spreadsheets, data visualization, analytical reasoning, and communication. Preferred: Python and Tableau.', ['SQL', 'Spreadsheets', 'Data visualization', 'Communication'], ['Python', 'Tableau'], '1+ year'],
];

async function ensureStarterJobs(userId) {
  const [existingJobs] = await pool.query('SELECT id FROM job_descriptions WHERE user_id = ? LIMIT 1', [userId]);
  if (existingJobs.length) return;
  await pool.query(
    `INSERT INTO job_descriptions
     (user_id, title, company, description, required_skills, preferred_skills, experience_requirements, source)
     VALUES ?`,
    [starterJobs.map(([title, company, description, required, preferred, experience]) => [
      userId, title, company, description, JSON.stringify(required), JSON.stringify(preferred), experience, 'demo',
    ])],
  );
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
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const providerConfig = getAdzunaConfig();
    if (providerConfig) {
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

    await ensureStarterJobs(req.user.id);
    const values = [req.user.id];
    let where = 'user_id = ? AND source <> \'adzuna\'';

    if (req.query.search) {
      where += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
      const search = `%${String(req.query.search).slice(0, 100)}%`;
      values.push(search, search, search);
    }
    if (req.query.company) {
      where += ' AND company = ?';
      values.push(String(req.query.company).slice(0, 150));
    }
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM job_descriptions WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM job_descriptions WHERE ${where}`, values);

    return res.status(200).json(successResponse('Sample job listings retrieved successfully', {
      jobs: rows,
      sourceMode: 'demo',
      source: null,
      pagination: { page, limit, total: countRows[0].total, totalPages: Math.ceil(countRows[0].total / limit) },
    }));
  } catch (error) {
    next(error);
  }
}

async function createJob(req, res, next) {
  try {
    const { title, company, description, required_skills, preferred_skills, experience_requirements } = req.body || {};

    if (!title || !description) {
      return res.status(400).json(errorResponse('Job title and description are required', 400));
    }

    const [result] = await pool.query(
      `INSERT INTO job_descriptions (user_id, title, company, description, required_skills, preferred_skills, experience_requirements, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        req.user.id,
        String(title).trim(),
        company || null,
        String(description).trim(),
        required_skills ? JSON.stringify(required_skills) : JSON.stringify([]),
        preferred_skills ? JSON.stringify(preferred_skills) : JSON.stringify([]),
        experience_requirements || null,
      ],
    );

    const [rows] = await pool.query('SELECT * FROM job_descriptions WHERE id = ? LIMIT 1', [result.insertId]);

    return res.status(201).json(successResponse('Job description created successfully', { job: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function getJob(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json(errorResponse('Job description not found', 404));
    }

    return res.status(200).json(successResponse('Job description retrieved successfully', { job: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function updateJob(req, res, next) {
  try {
    const { title, company, description, required_skills, preferred_skills, experience_requirements } = req.body || {};

    const [existing] = await pool.query(
      'SELECT id FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );

    if (!existing.length) {
      return res.status(404).json(errorResponse('Job description not found', 404));
    }

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(String(title).trim());
    }

    if (company !== undefined) {
      updates.push('company = ?');
      values.push(company || null);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(String(description).trim());
    }

    if (required_skills !== undefined) {
      updates.push('required_skills = ?');
      values.push(JSON.stringify(required_skills));
    }

    if (preferred_skills !== undefined) {
      updates.push('preferred_skills = ?');
      values.push(JSON.stringify(preferred_skills));
    }

    if (experience_requirements !== undefined) {
      updates.push('experience_requirements = ?');
      values.push(experience_requirements || null);
    }

    if (!updates.length) {
      return res.status(400).json(errorResponse('No valid job fields provided', 400));
    }

    values.push(req.params.id, req.user.id);

    await pool.query(
      `UPDATE job_descriptions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
    );

    const [rows] = await pool.query('SELECT * FROM job_descriptions WHERE id = ? LIMIT 1', [req.params.id]);

    return res.status(200).json(successResponse('Job description updated successfully', { job: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function deleteJob(req, res, next) {
  try {
    const [result] = await pool.query(
      'DELETE FROM job_descriptions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(errorResponse('Job description not found', 404));
    }

    return res.status(200).json(successResponse('Job description deleted successfully', { deleted: true }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listJobs,
  createJob,
  getJob,
  updateJob,
  deleteJob,
};
