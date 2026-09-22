const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getDashboardSummary } = require('../controllers/dashboardController');

const router = express.Router();
router.use(authMiddleware);
router.get('/summary', getDashboardSummary);
module.exports = router;
