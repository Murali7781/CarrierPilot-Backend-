const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { listJobs, createJob, getJob, updateJob, deleteJob } = require('../controllers/jobController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', requirePermission('jobs.view'), listJobs);
router.post('/', requirePermission('jobs.create'), createJob);
router.get('/:id', requirePermission('jobs.view'), getJob);
router.put('/:id', requirePermission('jobs.update'), updateJob);
router.delete('/:id', requirePermission('jobs.delete'), deleteJob);

module.exports = router;
