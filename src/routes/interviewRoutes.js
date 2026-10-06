const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
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
router.post('/', createInterview);
router.get('/', listInterviews);
router.get('/:id', getInterview);
router.post('/:id/questions/generate', practiceAiLimit, generateQuestions);
router.post('/:id/questions', addQuestion);
router.post('/:id/answers', practiceAiLimit, addAnswer);
router.patch('/:id/status', updateInterviewStatus);

module.exports = router;
