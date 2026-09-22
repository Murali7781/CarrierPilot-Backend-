const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

const statuses = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

function validateDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isNaN(Date.parse(value))) return `${field} must be a valid date`;
  return value;
}

async function listApplications(req, res, next) {
  try {
    const values = [req.user.id];
    let where = 'a.user_id = ?';
    if (req.query.status) {
      if (!statuses.includes(req.query.status)) return res.status(400).json(errorResponse('Invalid application status', 400));
      where += ' AND a.status = ?';
      values.push(req.query.status);
    }
    const [rows] = await pool.query(
      `SELECT a.*, j.title, j.company FROM applications a
       JOIN job_descriptions j ON j.id = a.job_id
       WHERE ${where} ORDER BY a.updated_at DESC`,
      values,
    );
    return res.status(200).json(successResponse('Applications retrieved successfully', { applications: rows }));
  } catch (error) {
    next(error);
  }
}

async function createApplication(req, res, next) {
  try {
    const body = req.body || {};
    const jobId = Number(body.job_id || body.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json(errorResponse('job_id must be a positive integer', 400));
    const status = body.status || 'applied';
    if (!statuses.includes(status)) return res.status(400).json(errorResponse('Invalid application status', 400));
    const nextActionDate = validateDate(body.next_action_date, 'next_action_date');
    const interviewDate = validateDate(body.interview_date, 'interview_date');
    if (typeof nextActionDate === 'string') return res.status(400).json(errorResponse(nextActionDate, 400));
    if (typeof interviewDate === 'string') return res.status(400).json(errorResponse(interviewDate, 400));
    const [jobs] = await pool.query('SELECT id FROM job_descriptions WHERE id = ? LIMIT 1', [jobId]);
    if (!jobs.length) return res.status(404).json(errorResponse('Job not found', 404));
    const [result] = await pool.query(
      `INSERT INTO applications (user_id, job_id, status, notes, next_action_date, interview_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, jobId, status, body.notes ? String(body.notes).trim() : null, nextActionDate, interviewDate],
    );
    const [rows] = await pool.query('SELECT * FROM applications WHERE id = ? LIMIT 1', [result.insertId]);
    return res.status(201).json(successResponse('Application created successfully', { application: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function updateApplication(req, res, next) {
  try {
    const body = req.body || {};
    const [existing] = await pool.query('SELECT id FROM applications WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing.length) return res.status(404).json(errorResponse('Application not found', 404));
    const updates = [];
    const values = [];
    if (body.status !== undefined) {
      if (!statuses.includes(body.status)) return res.status(400).json(errorResponse('Invalid application status', 400));
      updates.push('status = ?'); values.push(body.status);
    }
    for (const field of ['notes', 'next_action_date', 'interview_date']) {
      if (body[field] !== undefined) {
        const value = field === 'notes' ? (body[field] ? String(body[field]).trim() : null) : validateDate(body[field], field);
        if (typeof value === 'string' && field !== 'notes') return res.status(400).json(errorResponse(value, 400));
        updates.push(`${field} = ?`); values.push(value);
      }
    }
    if (!updates.length) return res.status(400).json(errorResponse('No valid application fields provided', 400));
    values.push(req.params.id, req.user.id);
    await pool.query(`UPDATE applications SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM applications WHERE id = ? LIMIT 1', [req.params.id]);
    return res.status(200).json(successResponse('Application updated successfully', { application: rows[0] }));
  } catch (error) { next(error); }
}

async function deleteApplication(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM applications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json(errorResponse('Application not found', 404));
    return res.status(200).json(successResponse('Application deleted successfully', { deleted: true }));
  } catch (error) { next(error); }
}

module.exports = { listApplications, createApplication, updateApplication, deleteApplication };
