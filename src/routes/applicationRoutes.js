const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { listApplications, createApplication, updateApplication, deleteApplication } = require('../controllers/applicationController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', listApplications);
router.post('/', createApplication);
router.put('/:id', updateApplication);
router.delete('/:id', deleteApplication);
module.exports = router;
