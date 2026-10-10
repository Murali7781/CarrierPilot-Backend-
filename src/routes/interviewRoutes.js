const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const authRateLimit = require('../middleware/authRateLimit');
const {
  createInterview,
  listInterviews,
  getInterview,
  addQuestion,
  addAnswer,
  generateQuestions,
  updateInterviewStatus,
} = require('../controllers/interviewController');

const router = express.Router();
const practiceAiLimit = authRateLimit({ limit: 20, windowMs: 60 * 1000, message: 'You have sent several practice requests. Pause for a minute and try again.' });

router.use(authMiddleware);
router.post('/', requirePermission('interviews.create'), createInterview);
router.get('/', requirePermission('interviews.view'), listInterviews);
router.get('/:id', requirePermission('interviews.view'), getInterview);
router.post('/:id/questions/generate', requirePermission('interviews.manage'), practiceAiLimit, generateQuestions);
router.post('/:id/questions', requirePermission('interviews.manage'), addQuestion);
router.post('/:id/answers', requirePermission('interviews.manage'), practiceAiLimit, addAnswer);
router.patch('/:id/status', requirePermission('interviews.manage'), updateInterviewStatus);

module.exports = router;
