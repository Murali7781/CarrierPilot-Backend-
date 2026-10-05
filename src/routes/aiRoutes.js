const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authRateLimit = require('../middleware/authRateLimit');
const { chatWithAi, getAiStatus, reviewResumeForRole } = require('../controllers/aiController');

const router = express.Router();

router.use(authMiddleware);
router.get('/status', getAiStatus);
router.post('/resume-review', authRateLimit({ limit: 10, windowMs: 60 * 60 * 1000, message: 'Resume review limit reached. Try again later.' }), reviewResumeForRole);
router.post('/chat', authRateLimit({ limit: 30, windowMs: 60 * 1000, message: 'You have sent several messages. Please pause for a minute and try again.' }), chatWithAi);

module.exports = router;
