const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret } = require('../config/environment');
const { errorResponse } = require('../utils/response');

function readSessionCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== 'careerpilot_session') continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function authMiddleware(req, res, next) {
  const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const token = readSessionCookie(req) || bearerToken;
  if (!token) return res.status(401).json(errorResponse('Sign in to continue', 401));

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'careerpilot-api',
      audience: 'careerpilot-web',
    });
  } catch {
    return res.status(401).json(errorResponse('Your session is invalid or expired. Sign in again.', 401));
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, mobile, role, token_version, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [decoded.id],
    );
    if (!rows.length) {
      return res.status(401).json(errorResponse('Your session is no longer valid. Sign in again.', 401));
    }

    const dbUser = rows[0];
    const role = String(dbUser.role || '').toLowerCase();
    const decodedRole = String(decoded.role || '').toLowerCase();

    if (!role || !['candidate', 'recruiter', 'admin'].includes(role)) {
      return res.status(401).json(errorResponse('Your account role is invalid. Contact support.', 401));
    }

    if (decodedRole && decodedRole !== role) {
      return res.status(401).json(errorResponse('Your session role has changed. Sign in again.', 401));
    }

    if (Number(decoded.tokenVersion) !== Number(dbUser.token_version)) {
      return res.status(401).json(errorResponse('Your session is no longer valid. Sign in again.', 401));
    }

    req.user = { ...dbUser, role };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authMiddleware;
