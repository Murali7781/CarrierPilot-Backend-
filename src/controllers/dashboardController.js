const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');

async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const [
      [profileRows],
      [counts],
      [recommendedJobs],
      [recentJobs],
      [upcomingInterviews],
      [skillGaps],
      [recentActivity],
    ] = await Promise.all([
      pool.query('SELECT id, name, email, mobile, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [userId]),
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM resumes WHERE user_id = ?) AS resumes,
          (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?) AS saved_jobs,
          (SELECT COUNT(*) FROM applications WHERE user_id = ?) AS applications,
          (SELECT COUNT(*) FROM applications WHERE user_id = ? AND status = 'interview') AS interviews`,
        [userId, userId, userId, userId],
      ),
      pool.query(
        `SELECT id, title, company, description, required_skills, preferred_skills, created_at
         FROM job_descriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT id, title, company, created_at FROM job_descriptions
         WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT a.id, a.job_id, a.status, a.interview_date, a.next_action_date, j.title, j.company
         FROM applications a JOIN job_descriptions j ON j.id = a.job_id
         WHERE a.user_id = ? AND a.interview_date >= NOW()
         ORDER BY a.interview_date ASC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT id, skill_name, current_level, missing_level, priority, recommended_topics
         FROM skill_gaps WHERE user_id = ? ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC LIMIT 10`,
        [userId],
      ),
      pool.query(
        `SELECT 'application' AS type, a.id, a.status AS label, a.updated_at AS occurred_at,
                j.title, j.company
         FROM applications a JOIN job_descriptions j ON j.id = a.job_id
         WHERE a.user_id = ?
         UNION ALL
         SELECT 'saved_job' AS type, sj.id, 'saved' AS label, sj.created_at AS occurred_at,
                j.title, j.company
         FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id
         WHERE sj.user_id = ?
         ORDER BY occurred_at DESC LIMIT 10`,
        [userId, userId],
      ),
    ]);

    return res.status(200).json(successResponse('Dashboard summary retrieved successfully', {
      profile: profileRows[0] || null,
      counts: counts[0],
      recommendedJobs,
      recentJobs,
      upcomingInterviews,
      skillGaps,
      recentActivity,
    }));
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboardSummary };
