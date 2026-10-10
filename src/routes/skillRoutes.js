const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { getSkillGaps } = require('../controllers/skillController');

const router = express.Router();

router.use(authMiddleware);
router.get('/gaps', requirePermission('skills.view'), getSkillGaps);

module.exports = router;
