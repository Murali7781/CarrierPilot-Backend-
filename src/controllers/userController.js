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

async function getProfile(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, mobile, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json(errorResponse('User profile not found', 404));
    }

    return res.status(200).json(successResponse('Profile retrieved successfully', { user: sanitizeUser(rows[0]) }));
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, mobile, email } = req.body || {};
    const userId = req.user.id;

    if (!name && !mobile && !email) {
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

    const [updatedRows] = await pool.query(
      'SELECT id, name, email, mobile, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId],
    );

    return res.status(200).json(successResponse('Profile updated successfully', { user: sanitizeUser(updatedRows[0]) }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
};
