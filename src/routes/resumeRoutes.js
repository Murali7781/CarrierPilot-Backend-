const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const uploadResumePdf = require('../middleware/resumeUpload');
const authRateLimit = require('../middleware/authRateLimit');
const {
  listResumes,
  createResumeRecord,
  importResumeRecord,
  getResume,
  updateResumeRecord,
  deleteResumeRecord,
  downloadResume,
  analyzeResumeForJob,
} = require('../controllers/resumeController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listResumes);
router.post('/', uploadResumePdf, createResumeRecord);
router.post('/:id/analyze', analyzeResumeForJob);
router.get('/:id/file', downloadResume);
router.post(
  '/import',
  authRateLimit({ limit: 5, windowMs: 60 * 60 * 1000, message: 'Resume import limit reached. Try again later.' }),
  uploadResumePdf.memory,
  importResumeRecord,
);
router.get('/:id', getResume);
router.put('/:id', uploadResumePdf, updateResumeRecord);
router.delete('/:id', deleteResumeRecord);

module.exports = router;
