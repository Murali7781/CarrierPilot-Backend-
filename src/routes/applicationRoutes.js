const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { listApplications, createApplication, updateApplication, deleteApplication } = require('../controllers/applicationController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', requirePermission('applications.view'), listApplications);
router.post('/', requirePermission('applications.create'), createApplication);
router.put('/:id', requirePermission('applications.update'), updateApplication);
router.delete('/:id', requirePermission('applications.delete'), deleteApplication);
module.exports = router;
