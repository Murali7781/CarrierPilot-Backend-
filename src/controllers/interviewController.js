const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { positiveInteger } = require('../utils/validation');
const { generateInterviewQuestions, reviewInterviewAnswer } = require('../services/ai/aiService');
const { createInterviewResumeProfile } = require('../services/interviewResumeProfile');

const interviewTypes = new Set(['technical', 'behavioral', 'hr', 'mixed']);
const interviewStatuses = new Set(['active', 'completed', 'archived']);

function parseStoredList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return value.split(/[,;|\n]/).map((item) => item.trim()).filter(Boolean); }
}

async function getOwnedSession(userId, sessionId) {
  const [rows] = await pool.query(
    `SELECT s.*, j.title AS job_title, j.company AS job_company, r.title AS resume_title
     FROM interview_sessions s
     LEFT JOIN job_descriptions j ON j.id = s.job_id AND j.user_id = s.user_id
     LEFT JOIN resumes r ON r.id = s.resume_id AND r.user_id = s.user_id
     WHERE s.id = ? AND s.user_id = ? LIMIT 1`,
    [sessionId, userId],
  );
  return rows[0] || null;
}

async function createInterview(req, res, next) {
  try {
    const { type, title, job_id: rawJobId, resume_id: rawResumeId } = req.body || {};
    const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!interviewTypes.has(normalizedType)) return res.status(400).json(errorResponse('Choose technical, behavioral, HR, or mixed practice.', 400));
    if (normalizedTitle.length > 150) return res.status(400).json(errorResponse('Session title must be 150 characters or fewer.', 400));

    const jobId = rawJobId ? positiveInteger(rawJobId, 'job_id') : null;
    const resumeId = rawResumeId ? positiveInteger(rawResumeId, 'resume_id') : null;
    if (!resumeId) return res.status(400).json(errorResponse('Select a resume so the practice questions can be tailored to your actual experience and skills.', 400));
    let job = null;
    if (jobId) {
      const [rows] = await pool.query('SELECT id, title, company, description, required_skills, preferred_skills FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [jobId, req.user.id]);
      if (!rows.length) return res.status(404).json(errorResponse('The selected role was not found in your workspace.', 404));
      [job] = rows;
    }
    if (resumeId) {
      const [rows] = await pool.query('SELECT id FROM resumes WHERE id = ? AND user_id = ? LIMIT 1', [resumeId, req.user.id]);
      if (!rows.length) return res.status(404).json(errorResponse('The selected resume was not found in your workspace.', 404));
    }

    const [result] = await pool.query(
      'INSERT INTO interview_sessions (user_id, job_id, resume_id, type, title) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, jobId, resumeId, normalizedType, normalizedTitle || (job ? `${job.title} practice` : `${normalizedType[0].toUpperCase()}${normalizedType.slice(1)} practice`)],
    );
    const session = await getOwnedSession(req.user.id, result.insertId);
    return res.status(201).json(successResponse('Practice session created. Add questions to begin.', { interview: session }));
  } catch (error) { next(error); }
}

async function listInterviews(req, res, next) {
  try {
    const page = req.query.page === undefined ? 1 : positiveInteger(req.query.page, 'page');
    const limit = req.query.limit === undefined ? 20 : positiveInteger(req.query.limit, 'limit');
    if (page > 100000) return res.status(400).json(errorResponse('page must be 100,000 or fewer'));
    if (limit > 100) return res.status(400).json(errorResponse('limit must be 100 or fewer'));
    const offset = (page - 1) * limit;
    const [[rows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT s.id, s.job_id, s.resume_id, s.type, s.title, s.status, s.created_at, s.updated_at,
                j.title AS job_title, j.company AS job_company, r.title AS resume_title,
                (SELECT COUNT(*) FROM interview_questions q WHERE q.interview_id = s.id) AS question_count,
                (SELECT COUNT(*) FROM interview_answers a WHERE a.interview_id = s.id) AS answer_count
         FROM interview_sessions s
         LEFT JOIN job_descriptions j ON j.id = s.job_id AND j.user_id = s.user_id
         LEFT JOIN resumes r ON r.id = s.resume_id AND r.user_id = s.user_id
         WHERE s.user_id = ? ORDER BY s.updated_at DESC, s.id DESC LIMIT ? OFFSET ?`,
        [req.user.id, limit, offset],
      ),
      pool.query('SELECT COUNT(*) AS total FROM interview_sessions WHERE user_id = ?', [req.user.id]),
    ]);
    const total = Number(countRows[0].total) || 0;
    return res.status(200).json(successResponse('Interviews retrieved successfully', {
      interviews: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }));
  } catch (error) { next(error); }
}

async function getInterview(req, res, next) {
  try {
    const sessionId = positiveInteger(req.params.id, 'interview id');
    const interview = await getOwnedSession(req.user.id, sessionId);
    if (!interview) return res.status(404).json(errorResponse('Interview session not found.', 404));
    const [[questions], [answers]] = await Promise.all([
      pool.query('SELECT * FROM interview_questions WHERE interview_id = ? ORDER BY id ASC', [sessionId]),
      pool.query('SELECT * FROM interview_answers WHERE interview_id = ? AND user_id = ? ORDER BY id ASC', [sessionId, req.user.id]),
    ]);
    return res.status(200).json(successResponse('Interview retrieved successfully', { interview: { ...interview, questions, answers } }));
  } catch (error) { next(error); }
}

async function generateQuestions(req, res, next) {
  try {
    const sessionId = positiveInteger(req.params.id, 'interview id');
    const interview = await getOwnedSession(req.user.id, sessionId);
    if (!interview) return res.status(404).json(errorResponse('Interview session not found.', 404));
    if (interview.status !== 'active') return res.status(409).json(errorResponse('Only an active practice session can generate questions.', 409));
    const [existing] = await pool.query('SELECT id FROM interview_questions WHERE interview_id = ? LIMIT 1', [sessionId]);
    if (existing.length) return res.status(409).json(errorResponse('This session already has questions. Continue the existing practice session.', 409));

    let job = null;
    if (interview.job_id) {
      const [jobs] = await pool.query('SELECT title, company, description, required_skills, preferred_skills FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [interview.job_id, req.user.id]);
      if (jobs.length) job = jobs[0];
    }
    let resume = null;
    if (interview.resume_id) {
      const [resumes] = await pool.query(
        `SELECT title, professional_summary, skills, experience, education, projects,
                certifications, extracted_text
         FROM resumes WHERE id = ? AND user_id = ? LIMIT 1`,
        [interview.resume_id, req.user.id],
      );
      if (resumes.length) {
        const [skillEntries] = await pool.query(
          'SELECT skill_name FROM resume_skills WHERE resume_id = ? ORDER BY skill_name ASC',
          [interview.resume_id],
        );
        resume = createInterviewResumeProfile({ ...resumes[0], skill_entries: skillEntries });
      }
    }
    if (!resume) return res.status(400).json(errorResponse('Select a resume before generating tailored interview questions.', 400));
    const [recentRows] = await pool.query(
      `SELECT q.question_text FROM interview_questions q
       INNER JOIN interview_sessions previous ON previous.id = q.interview_id
       WHERE previous.user_id = ? AND previous.type = ? AND previous.id <> ? AND previous.job_id <=> ?
       ORDER BY previous.created_at DESC, q.id DESC LIMIT 30`,
      [req.user.id, interview.type, sessionId, interview.job_id],
    );
    const generated = await generateInterviewQuestions({
      userId: req.user.id,
      type: interview.type,
      roleTitle: job?.title || interview.title,
      company: job?.company,
      jobDescription: job?.description,
      requiredSkills: parseStoredList(job?.required_skills),
      preferredSkills: parseStoredList(job?.preferred_skills),
      resumeSummary: resume.summary,
      resumeSkills: resume.skills,
      experience: resume.experience,
      resumeProfile: resume,
      previousQuestions: recentRows.map((row) => row.question_text),
    });
    const questions = generated.questions;
    if (questions.length !== 15) return res.status(502).json(errorResponse('CareerPilot could not prepare a complete question set. Please try again.', 502));

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [locked] = await connection.query('SELECT id FROM interview_sessions WHERE id = ? AND user_id = ? FOR UPDATE', [sessionId, req.user.id]);
      if (!locked.length) { await connection.rollback(); return res.status(404).json(errorResponse('Interview session not found.', 404)); }
      const [currentQuestions] = await connection.query('SELECT id FROM interview_questions WHERE interview_id = ? LIMIT 1', [sessionId]);
      if (currentQuestions.length) { await connection.rollback(); return res.status(409).json(errorResponse('Questions have already been created for this session.', 409)); }
      await connection.query('INSERT INTO interview_questions (interview_id, question_text, question_type, metadata) VALUES ?', [questions.map((question) => [sessionId, question.question, question.category, JSON.stringify({ category: question.category, type: question.type, difficulty: question.difficulty, skills: question.skills })])]);
      await connection.query("UPDATE interview_sessions SET status = 'active' WHERE id = ? AND user_id = ?", [sessionId, req.user.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    const [created] = await pool.query('SELECT id, interview_id, question_text, question_type, metadata, created_at FROM interview_questions WHERE interview_id = ? ORDER BY id ASC', [sessionId]);
    return res.status(201).json(successResponse('Practice questions generated from your resume and role context.', {
      questions: created,
      mode: generated.mode,
      notice: generated.notice,
      resumeAnalysis: {
        summary: resume.summary,
        skills: resume.skills,
        experienceYears: resume.experienceYears,
        experienceLevel: resume.experienceLevel,
        evidenceCounts: resume.evidenceCounts,
      },
    }));
  } catch (error) { next(error); }
}

async function addQuestion(req, res, next) {
  try {
    const sessionId = positiveInteger(req.params.id, 'interview id');
    const questionText = typeof req.body?.question_text === 'string' ? req.body.question_text.trim() : '';
    const questionType = typeof req.body?.question_type === 'string' ? req.body.question_type.trim() : '';
    if (!questionText || questionText.length > 4000) return res.status(400).json(errorResponse('Question text must contain 1 to 4,000 characters.', 400));
    if (!await getOwnedSession(req.user.id, sessionId)) return res.status(404).json(errorResponse('Interview session not found.', 404));
    const [result] = await pool.query('INSERT INTO interview_questions (interview_id, question_text, question_type) VALUES (?, ?, ?)', [sessionId, questionText, questionType || null]);
    const [rows] = await pool.query('SELECT id, interview_id, question_text, question_type, metadata, created_at FROM interview_questions WHERE id = ? LIMIT 1', [result.insertId]);
    return res.status(201).json(successResponse('Question added successfully', { question: rows[0] }));
  } catch (error) { next(error); }
}

async function addAnswer(req, res, next) {
  try {
    const sessionId = positiveInteger(req.params.id, 'interview id');
    const questionId = positiveInteger(req.body?.question_id, 'question_id');
    const answerText = typeof req.body?.answer_text === 'string' ? req.body.answer_text.trim() : '';
    if (!answerText || answerText.length > 12000) return res.status(400).json(errorResponse('Answer must contain 1 to 12,000 characters.', 400));
    const interview = await getOwnedSession(req.user.id, sessionId);
    if (!interview) return res.status(404).json(errorResponse('Interview session not found.', 404));
    const [questionRows] = await pool.query('SELECT id, question_text FROM interview_questions WHERE id = ? AND interview_id = ? LIMIT 1', [questionId, sessionId]);
    if (!questionRows.length) return res.status(404).json(errorResponse('Question not found in this interview.', 404));

    const review = await reviewInterviewAnswer({ question: questionRows[0].question_text, answer: answerText.slice(0, 5000), userId: req.user.id });
    const feedback = review.response;
    const [result] = await pool.query(
      'INSERT INTO interview_answers (interview_id, question_id, user_id, answer_text, ai_feedback) VALUES (?, ?, ?, ?, ?)',
      [sessionId, questionId, req.user.id, answerText, feedback],
    );
    await pool.query('UPDATE interview_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [sessionId, req.user.id]);
    const [rows] = await pool.query('SELECT * FROM interview_answers WHERE id = ? LIMIT 1', [result.insertId]);
    return res.status(201).json(successResponse('Answer saved and reviewed.', { answer: rows[0], feedbackMode: review.mode, feedbackNotice: review.notice }));
  } catch (error) { next(error); }
}

async function updateInterviewStatus(req, res, next) {
  try {
    const sessionId = positiveInteger(req.params.id, 'interview id');
    const status = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
    if (!interviewStatuses.has(status)) return res.status(400).json(errorResponse('Status must be active, completed, or archived.', 400));
    const interviewExists = await getOwnedSession(req.user.id, sessionId);
    if (!interviewExists) return res.status(404).json(errorResponse('Interview session not found.', 404));
    if (status === 'completed') {
      const [progress] = await pool.query(
        `SELECT COUNT(DISTINCT q.id) AS questions, COUNT(DISTINCT a.question_id) AS answered
         FROM interview_questions q LEFT JOIN interview_answers a ON a.question_id = q.id AND a.interview_id = q.interview_id
         WHERE q.interview_id = ?`,
        [sessionId],
      );
      if (!Number(progress[0]?.questions) || Number(progress[0].answered) < Number(progress[0].questions)) {
        return res.status(409).json(errorResponse('Answer every question before completing this practice session.', 409));
      }
    }
    await pool.query('UPDATE interview_sessions SET status = ? WHERE id = ? AND user_id = ?', [status, sessionId, req.user.id]);
    const interview = await getOwnedSession(req.user.id, sessionId);
    return res.status(200).json(successResponse('Interview status updated.', { interview }));
  } catch (error) { next(error); }
}

module.exports = { createInterview, listInterviews, getInterview, addQuestion, addAnswer, generateQuestions, updateInterviewStatus };
