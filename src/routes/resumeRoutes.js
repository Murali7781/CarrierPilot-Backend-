const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authRateLimit = require('../middleware/authRateLimit');
const resumeUpload = require('../middleware/resumeUpload');
const {
  listResumes,
  createResumeRecord,
  importResumeRecord,
  getResume,
  updateResumeRecord,
  deleteResumeRecord,
} = require('../controllers/resumeController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listResumes);
router.post('/import', authRateLimit({ limit: 5, windowMs: 60 * 60 * 1000, message: 'Resume import limit reached. Try again later.' }), resumeUpload, importResumeRecord);
router.post('/', createResumeRecord);
router.get('/:id', getResume);
router.put('/:id', updateResumeRecord);
router.delete('/:id', deleteResumeRecord);

module.exports = router;
