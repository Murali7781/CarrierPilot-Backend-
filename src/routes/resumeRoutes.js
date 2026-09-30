const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const uploadResumePdf = require('../middleware/resumeUpload');
const {
  listResumes,
  createResumeRecord,
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
router.get('/:id', getResume);
router.put('/:id', uploadResumePdf, updateResumeRecord);
router.delete('/:id', deleteResumeRecord);

module.exports = router;
