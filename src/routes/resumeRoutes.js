const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
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
router.get('/', requirePermission('resumes.view'), listResumes);
router.post('/', requirePermission('resumes.create'), uploadResumePdf, createResumeRecord);
router.post('/:id/analyze', requirePermission('resumes.view'), analyzeResumeForJob);
router.get('/:id/file', requirePermission('resumes.view'), downloadResume);
router.post(
  '/import',
  requirePermission('resumes.create'),
  authRateLimit({ limit: 5, windowMs: 60 * 60 * 1000, message: 'Resume import limit reached. Try again later.' }),
  uploadResumePdf.memory,
  importResumeRecord,
);
router.get('/:id', requirePermission('resumes.view'), getResume);
router.put('/:id', requirePermission('resumes.update'), uploadResumePdf, updateResumeRecord);
router.delete('/:id', requirePermission('resumes.delete'), deleteResumeRecord);

module.exports = router;
