const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret } = require('../config/environment');
const { errorResponse } = require('../utils/response');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(errorResponse('Authentication token is required', 401));
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });

    const [rows] = await pool.query(
      'SELECT id, name, email, mobile, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [decoded.id],
    );

    if (!rows.length) {
      return res.status(401).json(errorResponse('User not found or token is invalid', 401));
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json(errorResponse('Invalid or expired token', 401));
  }
}

module.exports = authMiddleware;
