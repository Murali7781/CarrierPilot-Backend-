const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function listJobs(req, res, next) {
  try {
    
    if (req.query.search) {
      where += ' AND (title LIKE ? OR company LIKE ?)';
      const search = `%${String(req.query.search).slice(0, 100)}%`;
      values.push(search, search);
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

    return res.status(200).json(successResponse('Job descriptions retrieved successfully', {
      jobs: rows,
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
      `INSERT INTO job_descriptions (user_id, title, company, description, required_skills, preferred_skills, experience_requirements)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
