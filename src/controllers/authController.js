const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret } = require('../config/environment');
const { successResponse, errorResponse } = require('../utils/response');

const sessionCookieName = 'careerpilot_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;
const tokenIssuer = 'careerpilot-api';
const tokenAudience = 'careerpilot-web';

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, tokenVersion: Number(user.token_version) || 0 },
    getJwtSecret(),
    { expiresIn: '8h', algorithm: 'HS256', issuer: tokenIssuer, audience: tokenAudience },
  );
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: sessionDurationMs,
    path: '/api',
  });
}

function getSafeUser(user) {
  return { id: user.id, name: user.name, email: user.email, mobile: user.mobile || null };
}

async function register(req, res, next) {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const mobile = typeof body.mobile === 'string' ? body.mobile.trim() : '';

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json(errorResponse('Name, email, and password are required', 400));
    }
    if (name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
      return res.status(400).json(errorResponse('Name must be 1 to 100 valid characters', 400));
    }
    if (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json(errorResponse('Please provide a valid email address', 400));
    }
    if (password.length < 12) {
      return res.status(400).json(errorResponse('Use a password with at least 12 characters', 400));
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json(errorResponse('Password must be 72 bytes or fewer', 400));
    }
    if (mobile.length > 20) {
      return res.status(400).json(errorResponse('Mobile number must be 20 characters or fewer', 400));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, mobile) VALUES (?, ?, ?, ?)',
      [name, normalizedEmail, hashedPassword, mobile || null],
    );
    const user = { id: result.insertId, name, email: normalizedEmail, mobile: mobile || null, token_version: 0 };
    setSessionCookie(res, user);

    return res.status(201).json(successResponse('Account created successfully', { user: getSafeUser(user) }));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json(errorResponse('An account with this email already exists', 409));
    }
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(401).json(errorResponse('Invalid email or password', 401));
    }

    const [users] = await pool.query(
      'SELECT id, name, email, password, mobile, token_version FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    if (!users.length || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json(errorResponse('Invalid email or password', 401));
    }

    const user = users[0];
    setSessionCookie(res, user);
    return res.status(200).json(successResponse('Login successful', { user: getSafeUser(user) }));
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api',
    });
    return res.status(200).json(successResponse('Signed out successfully', { signedOut: true }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, login, logout };
