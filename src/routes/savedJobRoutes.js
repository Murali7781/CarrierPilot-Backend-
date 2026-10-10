const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { listSavedJobs, saveJob, deleteSavedJob } = require('../controllers/savedJobController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', requirePermission('savedJobs.view'), listSavedJobs);
router.post('/', requirePermission('savedJobs.manage'), saveJob);
router.delete('/:id', requirePermission('savedJobs.manage'), deleteSavedJob);
module.exports = router;
