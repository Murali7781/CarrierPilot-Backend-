const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { listSavedJobs, saveJob, deleteSavedJob } = require('../controllers/savedJobController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', listSavedJobs);
router.post('/', saveJob);
router.delete('/:id', deleteSavedJob);
module.exports = router;
