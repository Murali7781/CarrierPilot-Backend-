const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { listJobs, createJob, getJob, updateJob, deleteJob } = require('../controllers/jobController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listJobs);
router.post('/', createJob);
router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
