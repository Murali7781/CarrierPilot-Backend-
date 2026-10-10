const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const authRateLimit = require('../middleware/authRateLimit');
const { chatWithAi, getAiStatus, reviewResumeForRole } = require('../controllers/aiController');

const router = express.Router();

router.use(authMiddleware);
router.get('/status', requirePermission('ai.status'), getAiStatus);
router.post('/resume-review', requirePermission('ai.resumeReview'), authRateLimit({ limit: 10, windowMs: 60 * 60 * 1000, message: 'Resume review limit reached. Try again later.' }), reviewResumeForRole);
router.post('/chat', requirePermission('ai.chat'), authRateLimit({ limit: 30, windowMs: 60 * 1000, message: 'You have sent several messages. Please pause for a minute and try again.' }), chatWithAi);

module.exports = router;
