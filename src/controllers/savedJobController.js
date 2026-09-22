const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function listSavedJobs(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT sj.id, sj.job_id, sj.created_at, j.title, j.company, j.description,
              j.required_skills, j.preferred_skills, j.experience_requirements
       FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id
       WHERE sj.user_id = ? ORDER BY sj.created_at DESC`,
      [req.user.id],
    );
    return res.status(200).json(successResponse('Saved jobs retrieved successfully', { jobs: rows }));
  } catch (error) {
    next(error);
  }
}

async function saveJob(req, res, next) {
  try {
    const jobId = Number(req.body && (req.body.job_id || req.body.jobId));
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json(errorResponse('job_id must be a positive integer', 400));
    const [jobs] = await pool.query('SELECT id FROM job_descriptions WHERE id = ? LIMIT 1', [jobId]);
    if (!jobs.length) return res.status(404).json(errorResponse('Job not found', 404));
    await pool.query('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)', [req.user.id, jobId]);
    const [rows] = await pool.query('SELECT id, user_id, job_id, created_at FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.user.id, jobId]);
    return res.status(201).json(successResponse('Job saved successfully', { savedJob: rows[0] }));
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
