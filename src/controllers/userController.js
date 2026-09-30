const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function parsePreference(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getProfile(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
              p.desired_roles, p.preferred_locations, p.work_modes
       FROM users u
       LEFT JOIN candidate_preferences p ON p.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json(errorResponse('User profile not found', 404));
    }

    const user = sanitizeUser(rows[0]);
    user.targetRole = parsePreference(rows[0].desired_roles)[0] || '';
    user.location = parsePreference(rows[0].preferred_locations)[0] || '';
    user.workMode = parsePreference(rows[0].work_modes)[0] || 'Any';
    return res.status(200).json(successResponse('Profile retrieved successfully', { user }));
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, mobile, email, targetRole, location, workMode } = req.body || {};
    const userId = req.user.id;

    if (![name, mobile, email, targetRole, location, workMode].some((value) => value !== undefined)) {
      return res.status(400).json(errorResponse('Provide at least one field to update', 400));
    }

    const [currentUser] = await pool.query(
      'SELECT id, name, email, mobile FROM users WHERE id = ? LIMIT 1',
      [userId],
    );

    if (!currentUser.length) {
      return res.status(404).json(errorResponse('User profile not found', 404));
    }

    const nextName = name ? String(name).trim() : currentUser[0].name;
    const nextMobile = mobile ? String(mobile).trim() : currentUser[0].mobile;
    const nextEmail = email ? String(email).trim().toLowerCase() : currentUser[0].email;

    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return res.status(400).json(errorResponse('Please provide a valid email address', 400));
    }

    const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [nextEmail, userId]);

    if (existingEmail.length > 0) {
      return res.status(409).json(errorResponse('This email is already in use by another user', 409));
    }

    await pool.query(
      'UPDATE users SET name = ?, mobile = ?, email = ? WHERE id = ?',
      [nextName, nextMobile, nextEmail, userId],
    );

    if (targetRole !== undefined || location !== undefined || workMode !== undefined) {
      const [preferences] = await pool.query(
        'SELECT desired_roles, preferred_locations, work_modes FROM candidate_preferences WHERE user_id = ? LIMIT 1',
        [userId],
      );
      const current = preferences[0] || {};
      await pool.query(
      `INSERT INTO candidate_preferences (user_id, desired_roles, preferred_locations, work_modes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE desired_roles = VALUES(desired_roles),
       preferred_locations = VALUES(preferred_locations), work_modes = VALUES(work_modes)`,
      [
        userId,
        JSON.stringify(targetRole !== undefined ? (String(targetRole).trim() ? [String(targetRole).trim()] : []) : parsePreference(current.desired_roles)),
        JSON.stringify(location !== undefined ? (String(location).trim() ? [String(location).trim()] : []) : parsePreference(current.preferred_locations)),
        JSON.stringify(workMode !== undefined ? (String(workMode).trim() ? [String(workMode).trim()] : ['Any']) : parsePreference(current.work_modes)),
      ],
      );
    }

    const [updatedRows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
              p.desired_roles, p.preferred_locations, p.work_modes
       FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [userId],
    );

    const user = sanitizeUser(updatedRows[0]);
    user.targetRole = parsePreference(updatedRows[0].desired_roles)[0] || '';
    user.location = parsePreference(updatedRows[0].preferred_locations)[0] || '';
    user.workMode = parsePreference(updatedRows[0].work_modes)[0] || 'Any';
    return res.status(200).json(successResponse('Profile updated successfully', { user }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
};
