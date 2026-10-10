const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { getDashboardSummary } = require('../controllers/dashboardController');

const router = express.Router();
router.use(authMiddleware);
router.get('/summary', requirePermission('dashboard.view'), getDashboardSummary);
module.exports = router;
