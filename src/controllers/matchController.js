const { pool } = require('../config/db');
const { analyzeResumeAgainstJob } = require('../services/jobMatchService');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');

async function analyzeMatch(req, res, next) {
  try {
    const { resumeId, jobId } = req.body || {};

    if (!resumeId || !jobId) {
      return res.status(400).json(errorResponse('resumeId and jobId are required', 400));
    }

    const result = await analyzeResumeAgainstJob({
      userId: req.user.id,
      resumeId: positiveInteger(resumeId, 'resumeId'),
      jobId: positiveInteger(jobId, 'jobId'),
    });

    return res.status(200).json(successResponse('Match analysis completed successfully', { result }));
  } catch (error) {
    next(error);
  }
}

async function listMatches(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT jm.*, r.title AS resume_title, j.title AS job_title, j.company
       FROM job_matches jm
       LEFT JOIN resumes r ON r.id = jm.resume_id
       LEFT JOIN job_descriptions j ON j.id = jm.job_id
       WHERE jm.user_id = ?
       ORDER BY jm.created_at DESC`,
      [req.user.id],
    );

    return res.status(200).json(successResponse('Match analyses retrieved successfully', { matches: rows }));
  } catch (error) {
    next(error);
  }
}

async function getMatch(req, res, next) {
  try {
    const matchId = positiveInteger(req.params.id, 'match id');
    const [rows] = await pool.query(
      `SELECT jm.*, r.title AS resume_title, j.title AS job_title, j.company
       FROM job_matches jm
       LEFT JOIN resumes r ON r.id = jm.resume_id
       LEFT JOIN job_descriptions j ON j.id = jm.job_id
       WHERE jm.id = ? AND jm.user_id = ?
       LIMIT 1`,
      [matchId, req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json(errorResponse('Match analysis not found', 404));
    }

    return res.status(200).json(successResponse('Match analysis retrieved successfully', { match: rows[0] }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeMatch,
  listMatches,
  getMatch,
};
