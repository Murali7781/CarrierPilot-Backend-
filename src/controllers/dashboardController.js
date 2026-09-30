const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');

async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const [
      [profileRows],
      [countRows],
      [resumes],
      [jobs],
      [interviews],
      [skillGaps],
      [matches],
      [recentActivity],
    ] = await Promise.all([
      pool.query('SELECT id, name, email, mobile, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [userId]),
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM resumes WHERE user_id = ?) AS resumes,
          (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?) AS saved_jobs,
          (SELECT COUNT(*) FROM applications WHERE user_id = ?) AS applications,
          (SELECT COUNT(*) FROM interview_sessions WHERE user_id = ?) AS interviews,
          (SELECT COUNT(*) FROM job_matches WHERE user_id = ?) AS matches`,
        [userId, userId, userId, userId, userId],
      ),
      pool.query('SELECT id, title, skills, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5', [userId]),
      pool.query(
        `SELECT id, title, company, description, required_skills, preferred_skills, source,
                location, employment_type, created_at, published_at
         FROM job_descriptions WHERE user_id = ? ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT id, type, title, status, scheduled_at, created_at
         FROM interview_sessions WHERE user_id = ? ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT id, skill_name, current_level, missing_level, priority, recommended_topics
         FROM skill_gaps WHERE user_id = ? ORDER BY
         CASE LOWER(priority) WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC LIMIT 10`,
        [userId],
      ),
      pool.query(
        `SELECT jm.id, jm.resume_id, jm.job_id, jm.match_percentage, jm.created_at,
                r.title AS resume_title, j.title AS job_title, j.company
         FROM job_matches jm
         LEFT JOIN resumes r ON r.id = jm.resume_id
         LEFT JOIN job_descriptions j ON j.id = jm.job_id
         WHERE jm.user_id = ? ORDER BY jm.created_at DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT * FROM (
          SELECT 'application' AS type, a.id, a.status AS label, a.updated_at AS occurred_at,
                 j.title, j.company
          FROM applications a JOIN job_descriptions j ON j.id = a.job_id
          WHERE a.user_id = ?
          UNION ALL
          SELECT 'saved_job' AS type, sj.id, 'saved' AS label, sj.created_at AS occurred_at,
                 j.title, j.company
          FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id
          WHERE sj.user_id = ?
        ) activity ORDER BY occurred_at DESC LIMIT 10`,
        [userId, userId],
      ),
    ]);

    const counts = Object.fromEntries(Object.entries(countRows[0] || {}).map(([key, value]) => [key, Number(value) || 0]));
    return res.status(200).json(successResponse('Dashboard summary retrieved successfully', {
      profile: profileRows[0] || null,
      counts,
      resumes,
      jobs,
      recommendedJobs: jobs,
      interviews,
      upcomingInterviews: interviews.filter((item) => item.scheduled_at && new Date(item.scheduled_at) >= new Date()),
      skillGaps,
      matches,
      recentActivity,
    }));
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboardSummary };
