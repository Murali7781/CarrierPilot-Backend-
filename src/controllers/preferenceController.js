const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

const jsonFields = ['desired_roles', 'preferred_locations', 'work_modes', 'skills'];

function normalizeJsonField(value, fieldName) {
  if (!Array.isArray(value)) {
    return errorResponse(`${fieldName} must be an array`, 400);
  }
  return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
}

async function getPreferences(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM candidate_preferences WHERE user_id = ? LIMIT 1', [req.user.id]);
    return res.status(200).json(successResponse('Candidate preferences retrieved successfully', {
      preferences: rows[0] || null,
    }));
  } catch (error) {
    next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const body = req.body || {};
    const updates = [];
    const values = [];

    for (const field of jsonFields) {
      if (body[field] !== undefined) {
        const normalized = normalizeJsonField(body[field], field);
        if (typeof normalized !== 'string') return res.status(normalized.message ? 400 : 400).json(normalized);
        updates.push(`${field} = ?`);
        values.push(normalized);
      }
    }

    if (body.minimum_salary !== undefined) {
      const salary = Number(body.minimum_salary);
      if (!Number.isFinite(salary) || salary < 0) {
        return res.status(400).json(errorResponse('minimum_salary must be a non-negative number', 400));
      }
      updates.push('minimum_salary = ?');
      values.push(salary);
    }

    if (!updates.length) return res.status(400).json(errorResponse('No valid preference fields provided', 400));

    await pool.query(
      `INSERT INTO candidate_preferences (user_id) VALUES (?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [req.user.id],
    );
    values.push(req.user.id);
    await pool.query(`UPDATE candidate_preferences SET ${updates.join(', ')} WHERE user_id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM candidate_preferences WHERE user_id = ? LIMIT 1', [req.user.id]);
    return res.status(200).json(successResponse('Candidate preferences updated successfully', { preferences: rows[0] }));
  } catch (error) {
    next(error);
  }
}

module.exports = { getPreferences, updatePreferences };
