const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  listResumes,
  createResumeRecord,
  getResume,
  updateResumeRecord,
  deleteResumeRecord,
} = require('../controllers/resumeController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listResumes);
router.post('/', createResumeRecord);
router.get('/:id', getResume);
router.put('/:id', updateResumeRecord);
router.delete('/:id', deleteResumeRecord);

module.exports = router;
