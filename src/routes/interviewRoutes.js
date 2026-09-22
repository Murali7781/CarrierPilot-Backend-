const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createInterview,
  listInterviews,
  getInterview,
  addQuestion,
  addAnswer,
} = require('../controllers/interviewController');

const router = express.Router();

router.use(authMiddleware);
router.post('/', createInterview);
router.get('/', listInterviews);
router.get('/:id', getInterview);
router.post('/:id/questions', addQuestion);
router.post('/:id/answers', addAnswer);

module.exports = router;
