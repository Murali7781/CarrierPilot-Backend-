const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function createInterview(req, res, next) {
  try {
    const { type, title } = req.body || {};

    if (!type) {
      return res.status(400).json(errorResponse('Interview type is required', 400));
    }

    const [result] = await pool.query(
      'INSERT INTO interview_sessions (user_id, type, title) VALUES (?, ?, ?)',
      [req.user.id, String(type).trim(), title ? String(title).trim() : null],
    );

    const [rows] = await pool.query('SELECT * FROM interview_sessions WHERE id = ? LIMIT 1', [result.insertId]);

    return res.status(201).json(successResponse('Interview session created successfully', { interview: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function listInterviews(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
    );

    return res.status(200).json(successResponse('Interviews retrieved successfully', { interviews: rows }));
  } catch (error) {
    next(error);
  }
}

async function getInterview(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM interview_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json(errorResponse('Interview session not found', 404));
    }

    const [questions] = await pool.query(
      'SELECT * FROM interview_questions WHERE interview_id = ? ORDER BY created_at DESC',
      [req.params.id],
    );

    const [answers] = await pool.query(
      'SELECT * FROM interview_answers WHERE interview_id = ? ORDER BY created_at ASC',
      [req.params.id],
    );

    return res.status(200).json(successResponse('Interview retrieved successfully', {
      interview: { ...rows[0], questions, answers },
    }));
  } catch (error) {
    next(error);
  }
}

async function addQuestion(req, res, next) {
  try {
    const { question_text, question_type } = req.body || {};

    if (!question_text) {
      return res.status(400).json(errorResponse('Question text is required', 400));
    }

    const [session] = await pool.query(
      'SELECT id FROM interview_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );

    if (!session.length) {
      return res.status(404).json(errorResponse('Interview session not found', 404));
    }

    const [result] = await pool.query(
      'INSERT INTO interview_questions (interview_id, question_text, question_type) VALUES (?, ?, ?)',
      [req.params.id, String(question_text).trim(), question_type ? String(question_type).trim() : null],
    );

    const [rows] = await pool.query('SELECT * FROM interview_questions WHERE id = ? LIMIT 1', [result.insertId]);

    return res.status(201).json(successResponse('Question added successfully', { question: rows[0] }));
  } catch (error) {
    next(error);
  }
}

async function addAnswer(req, res, next) {
  try {
    const { question_id, answer_text } = req.body || {};

    if (!question_id || !answer_text) {
      return res.status(400).json(errorResponse('Question ID and answer text are required', 400));
    }

    const [session] = await pool.query(
      'SELECT id FROM interview_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id],
    );

    if (!session.length) {
      return res.status(404).json(errorResponse('Interview session not found', 404));
    }

    const [question] = await pool.query(
      'SELECT id FROM interview_questions WHERE id = ? AND interview_id = ? LIMIT 1',
      [question_id, req.params.id],
    );

    if (!question.length) {
      return res.status(404).json(errorResponse('Question not found in this interview', 404));
    }

    const [result] = await pool.query(
      'INSERT INTO interview_answers (interview_id, question_id, user_id, answer_text) VALUES (?, ?, ?, ?)',
      [req.params.id, question_id, req.user.id, String(answer_text).trim()],
    );

    const [rows] = await pool.query('SELECT * FROM interview_answers WHERE id = ? LIMIT 1', [result.insertId]);

    return res.status(201).json(successResponse('Answer saved successfully', { answer: rows[0] }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInterview,
  listInterviews,
  getInterview,
  addQuestion,
  addAnswer,
};
