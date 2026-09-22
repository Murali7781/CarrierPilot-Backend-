const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret } = require('../config/environment');
const { successResponse, errorResponse } = require('../utils/response');

async function register(req, res, next) {
  try {
    const { name, email, password, mobile } = req.body || {};

    if (!name || !email || !password || !mobile) {
      return res.status(400).json(errorResponse('Name, email, password, and mobile are required', 400));
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json(errorResponse('Please provide a valid email address', 400));
    }

    if (String(password).length < 6) {
      return res.status(400).json(errorResponse('Password must be at least 6 characters long', 400));
    }

    const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);

    if (existingUser.length > 0) {
      return res.status(409).json(errorResponse('A user with this email already exists', 409));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, mobile) VALUES (?, ?, ?, ?)',
      [String(name).trim(), normalizedEmail, hashedPassword, String(mobile).trim()],
    );

    const [newUser] = await pool.query(
      'SELECT id, name, email, mobile, created_at FROM users WHERE id = ? LIMIT 1',
      [result.insertId],
    );

    const user = newUser[0];

    return res.status(201).json(successResponse('User registered successfully', { user }));
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json(errorResponse('Email and password are required', 400));
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const [users] = await pool.query(
      'SELECT id, name, email, password, mobile FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail],
    );

    if (!users.length) {
      return res.status(401).json(errorResponse('Invalid email or password', 401));
    }

    const user = users[0];
    const isPasswordCorrect = await bcrypt.compare(String(password), user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json(errorResponse('Invalid email or password', 401));
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      getJwtSecret(),
      { expiresIn: '7d', algorithm: 'HS256' },
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
    };

    return res.status(200).json(successResponse('Login successful', { token, user: safeUser }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
};
