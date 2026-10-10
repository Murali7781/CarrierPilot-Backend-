const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');

const statuses = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

function validateDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isNaN(Date.parse(value))) return `${field} must be a valid date`;
  return value;
}

async function listApplications(req, res, next) {
  try {
    const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page, 'page');
    const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit, 'limit');
    if (page > 100000) return res.status(400).json(errorResponse('page must be 100,000 or fewer'));
    if (limit > 100) return res.status(400).json(errorResponse('limit must be 100 or fewer'));
    const values = [req.user.id];
    let where = 'a.user_id = ?';
    if (req.query.status) {
      if (!statuses.includes(req.query.status)) return res.status(400).json(errorResponse('Invalid application status', 400));
      where += ' AND a.status = ?';
      values.push(req.query.status);
    }
    const offset = (page - 1) * limit;
    const [[rows], [summaryRows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT a.id, a.job_id, a.status, a.notes, a.next_action_date, a.interview_date,
                a.created_at, a.updated_at, j.title AS job_title, j.company, j.location, j.source_url
         FROM applications a
         JOIN job_descriptions j ON j.id = a.job_id
         WHERE ${where} ORDER BY a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status NOT IN ('offer', 'rejected', 'withdrawn')), 0) AS active,
                COALESCE(SUM(status = 'interview'), 0) AS interviews,
                COALESCE(SUM(status = 'offer'), 0) AS offers
         FROM applications WHERE user_id = ?`,
        [req.user.id],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM applications a WHERE ${where}`, values),
    ]);
    const total = Number(countRows[0].total) || 0;
    return res.status(200).json(successResponse('Applications retrieved successfully', {
      applications: rows,
      summary: {
        total: Number(summaryRows[0].total) || 0,
        active: Number(summaryRows[0].active) || 0,
        interviews: Number(summaryRows[0].interviews) || 0,
        offers: Number(summaryRows[0].offers) || 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }));
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
    const [jobs] = await pool.query('SELECT id FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [jobId, req.user.id]);
    if (!jobs.length) return res.status(404).json(errorResponse('Job not found', 404));
    if (body.notes != null && String(body.notes).length > 2000) return res.status(400).json(errorResponse('Notes must be 2000 characters or fewer', 400));
    const [result] = await pool.query(
      `INSERT IGNORE INTO applications (user_id, job_id, status, notes, next_action_date, interview_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, jobId, status, body.notes ? String(body.notes).trim() : null, nextActionDate, interviewDate],
    );
    const [rows] = await pool.query('SELECT * FROM applications WHERE user_id = ? AND job_id = ? LIMIT 1', [req.user.id, jobId]);
    const created = result.affectedRows === 1;
    return res.status(created ? 201 : 200).json(successResponse(created ? 'Application created successfully' : 'Application already exists', { application: rows[0] }));
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
        if (field === 'notes' && body[field] != null && String(body[field]).length > 2000) return res.status(400).json(errorResponse('Notes must be 2000 characters or fewer', 400));
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
