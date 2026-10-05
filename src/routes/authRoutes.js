const express = require('express');
const { register, login, logout } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const authRateLimit = require('../middleware/authRateLimit');

const router = express.Router();

router.post('/register', authRateLimit({ limit: 5, windowMs: 60 * 60 * 1000, message: 'Too many registration attempts. Try again later.' }), register);
router.post('/login', authRateLimit({ limit: 10, windowMs: 15 * 60 * 1000, message: 'Too many sign-in attempts. Try again in 15 minutes.' }), login);
router.post('/logout', authMiddleware, logout);

module.exports = router;
