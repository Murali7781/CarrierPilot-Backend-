const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const { getUserSkillGaps } = require('../services/skillGapService');

async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const [profileRows, countRows, pipelineRows, applicationActivity, savedRoles, skillGaps, recentActivity] = await Promise.all([
      pool.query(
        `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
                p.desired_roles, p.preferred_locations, p.work_modes
         FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [userId],
      ),
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM resumes WHERE user_id = ?) AS resumes,
          (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?) AS saved_jobs,
          (SELECT COUNT(*) FROM applications WHERE user_id = ?) AS applications,
          (SELECT COUNT(*) FROM applications WHERE user_id = ? AND status = 'interview') AS interviews,
          (SELECT COUNT(*) FROM applications WHERE user_id = ? AND next_action_date < CURRENT_DATE AND status NOT IN ('offer','rejected','withdrawn')) AS overdue_followups,
          (SELECT COUNT(*) FROM interview_sessions WHERE user_id = ?) AS practice_sessions`,
        [userId, userId, userId, userId, userId, userId],
      ),
      pool.query(
        `SELECT status, COUNT(*) AS total FROM applications WHERE user_id = ? GROUP BY status ORDER BY status`,
        [userId],
      ),
      pool.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
         FROM applications
         WHERE user_id = ? AND created_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month ASC`,
        [userId],
      ),
      pool.query(
        `SELECT sj.id AS saved_id, sj.job_id, sj.created_at AS saved_at, j.title, j.company, j.location, j.source_url
         FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id
         WHERE sj.user_id = ? ORDER BY sj.created_at DESC LIMIT 5`,
        [userId],
      ),
      getUserSkillGaps(userId, 5),
      pool.query(
        `SELECT 'application' AS type, a.id, a.status AS label, a.updated_at AS occurred_at, j.title, j.company
         FROM applications a JOIN job_descriptions j ON j.id = a.job_id WHERE a.user_id = ?
         UNION ALL
         SELECT 'saved_job' AS type, sj.id, 'saved' AS label, sj.created_at AS occurred_at, j.title, j.company
         FROM saved_jobs sj JOIN job_descriptions j ON j.id = sj.job_id WHERE sj.user_id = ?
         UNION ALL
         SELECT 'interview' AS type, s.id, s.status AS label, s.updated_at AS occurred_at,
                COALESCE(NULLIF(s.title, ''), j.title, 'Interview practice') AS title, j.company
         FROM interview_sessions s LEFT JOIN job_descriptions j ON j.id = s.job_id
         WHERE s.user_id = ?
         ORDER BY occurred_at DESC LIMIT 6`,
        [userId, userId, userId],
      ),
    ]);

    const profile = profileRows[0][0] || null;
    if (profile) {
      const parseList = (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return [];
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      };
      profile.targetRole = parseList(profile.desired_roles)[0] || '';
      profile.location = parseList(profile.preferred_locations)[0] || '';
      profile.workMode = parseList(profile.work_modes)[0] || 'Any';
      delete profile.desired_roles;
      delete profile.preferred_locations;
      delete profile.work_modes;
    }

    return res.status(200).json(successResponse('Dashboard summary retrieved successfully', {
      profile,
      counts: countRows[0][0],
      applicationPipeline: pipelineRows[0],
      applicationActivity: applicationActivity[0],
      savedRoles: savedRoles[0],
      skillGaps,
      recentActivity: recentActivity[0],
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDashboardSummary };
