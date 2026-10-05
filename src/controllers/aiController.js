const { generateCareerAdvice, generateResumeReview, getAiMode } = require('../services/ai/aiService');
const { pool } = require('../config/db');
const { analyzeResumeAgainstJob } = require('../services/jobMatchService');
const { getUserSkillGaps } = require('../services/skillGapService');
const { successResponse, errorResponse } = require('../utils/response');

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

async function getCandidateContext(userId) {
  try {
    const [[profiles], [resumes], [savedRoles], [applications], [practice], skillGaps] = await Promise.all([
      pool.query(
        `SELECT u.name, p.desired_roles, p.preferred_locations, p.work_modes
         FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id WHERE u.id = ? LIMIT 1`,
        [userId],
      ),
      pool.query('SELECT title, professional_summary, skills FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 3', [userId]),
      pool.query(
        `SELECT j.title, j.company, j.location FROM saved_jobs s JOIN job_descriptions j ON j.id = s.job_id
         WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT j.title, j.company, a.status, a.next_action_date FROM applications a JOIN job_descriptions j ON j.id = a.job_id
         WHERE a.user_id = ? ORDER BY a.updated_at DESC LIMIT 5`,
        [userId],
      ),
      pool.query(
        `SELECT s.title, s.type, s.status, j.title AS role_title FROM interview_sessions s
         LEFT JOIN job_descriptions j ON j.id = s.job_id WHERE s.user_id = ? ORDER BY s.updated_at DESC LIMIT 3`,
        [userId],
      ),
      getUserSkillGaps(userId, 5),
    ]);
    const profile = profiles[0] || {};
    return JSON.stringify({
      profile: { name: profile.name, targetRoles: parseJson(profile.desired_roles) || [], locations: parseJson(profile.preferred_locations) || [], workModes: parseJson(profile.work_modes) || [] },
      resumes: resumes.map((resume) => ({ title: resume.title, summary: String(resume.professional_summary || '').slice(0, 500), skills: parseJson(resume.skills) || [] })),
      savedRoles: savedRoles.map((role) => ({ title: role.title, company: role.company, location: role.location })),
      applicationPipeline: applications.map((application) => ({ title: application.title, company: application.company, stage: application.status, followUp: application.next_action_date })),
      interviewPractice: practice.map((session) => ({ title: session.title, type: session.type, status: session.status, role: session.role_title })),
      skillGaps: skillGaps.map((gap) => ({ skill: gap.skill_name, role: gap.role_title, resume: gap.resume_title })),
    }).slice(0, 4500);
  } catch {
    return '';
  }
}

async function chatWithAi(req, res, next) {
  try {
    const { message, history = [] } = req.body || {};
    const context = req.body?.context;
    const allowedContexts = new Set(['Career overview', 'Career profile', 'Resume builder', 'Role search', 'Saved roles', 'Application tracker', 'Skills', 'Interview practice', 'Interview practice session', 'Career workspace']);

    if (typeof message !== 'string') return res.status(400).json(errorResponse('Message must be text', 400));
    const normalizedMessage = message.trim();

    if (!normalizedMessage) {
      return res.status(400).json(errorResponse('Message is required', 400));
    }

    const candidateContext = await getCandidateContext(req.user.id);
    const result = await generateCareerAdvice({
      userId: req.user.id,
      message: normalizedMessage,
      history,
      context: allowedContexts.has(context) ? context : '',
      candidateContext,
    });

    return res.status(200).json(successResponse('Career guidance generated', result));
  } catch (error) {
    next(error);
  }
}

function getAiStatus(req, res) {
  const mode = getAiMode();
  return res.status(200).json(successResponse('Career assistant status', {
    mode,
    message: mode === 'openai' ? 'An API key is configured; send a message to verify API access.' : 'Using local workspace-based guidance.',
  }));
}

async function reviewResumeForRole(req, res, next) {
  try {
    const resumeId = Number(req.body?.resumeId);
    const jobId = Number(req.body?.jobId);
    if (!Number.isSafeInteger(resumeId) || resumeId < 1 || !Number.isSafeInteger(jobId) || jobId < 1) {
      return res.status(400).json(errorResponse('Choose a valid resume and role to review.', 400));
    }
    const [[resumeRows], [jobRows]] = await Promise.all([
      pool.query('SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1', [resumeId, req.user.id]),
      pool.query('SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [jobId, req.user.id]),
    ]);
    if (!resumeRows.length) return res.status(404).json(errorResponse('Resume not found in your workspace.', 404));
    if (!jobRows.length) return res.status(404).json(errorResponse('Role not found in your workspace.', 404));
    const resume = resumeRows[0];
    const job = jobRows[0];
    resume.experience = parseJson(resume.experience) || [];
    resume.skills = parseJson(resume.skills) || [];
    resume.projects = parseJson(resume.projects) || [];
    job.required_skills = parseJson(job.required_skills) || [];
    job.preferred_skills = parseJson(job.preferred_skills) || [];
    const match = await analyzeResumeAgainstJob({ userId: req.user.id, resumeId, jobId, resumeRecord: resume, jobRecord: job });
    const review = await generateResumeReview({ resume, job, match, userId: req.user.id });
    return res.status(200).json(successResponse('Resume review completed.', { review, match }));
  } catch (error) { return next(error); }
}

module.exports = {
  chatWithAi,
  getAiStatus,
  reviewResumeForRole,
};
