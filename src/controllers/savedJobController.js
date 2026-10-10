const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');

async function listSavedJobs(req, res, next) {
  try {
    const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page, 'page');
    const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit, 'limit');
    if (page > 100000) return res.status(400).json(errorResponse('page must be 100,000 or fewer'));
    if (limit > 100) return res.status(400).json(errorResponse('limit must be 100 or fewer'));
    const offset = (page - 1) * limit;
    const where = ['sj.user_id = ?'];
    const values = [req.user.id];
    if (req.query.job_id !== undefined) {
      where.push('sj.job_id = ?');
      values.push(positiveInteger(req.query.job_id, 'job_id'));
    }
    const whereSql = where.join(' AND ');
    const [[rows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT sj.id, sj.job_id, sj.created_at, j.title, j.company
         FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id
         WHERE ${whereSql} ORDER BY sj.created_at DESC, sj.id DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM saved_jobs sj WHERE ${whereSql}`, values),
    ]);
    const total = Number(countRows[0].total) || 0;
    return res.status(200).json(successResponse('Saved jobs retrieved successfully', {
      jobs: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }));
  } catch (error) {
    next(error);
  }
}

async function saveJob(req, res, next) {
  try {
    const jobId = Number(req.body && (req.body.job_id || req.body.jobId));
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json(errorResponse('job_id must be a positive integer', 400));
    const [jobs] = await pool.query('SELECT id FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [jobId, req.user.id]);
    if (!jobs.length) return res.status(404).json(errorResponse('Job not found', 404));
    const [result] = await pool.query('INSERT IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)', [req.user.id, jobId]);
    const [rows] = await pool.query('SELECT id, user_id, job_id, created_at FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.user.id, jobId]);
    return res.status(result.affectedRows ? 201 : 200).json(successResponse(result.affectedRows ? 'Job saved successfully' : 'Job is already saved', { savedJob: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function deleteSavedJob(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM saved_jobs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json(errorResponse('Saved job not found', 404));
    return res.status(200).json(successResponse('Saved job removed successfully', { deleted: true }));
  } catch (error) {
    next(error);
  }
}

module.exports = { listSavedJobs, saveJob, deleteSavedJob };
