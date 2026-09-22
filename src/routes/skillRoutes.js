const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getSkillGaps } = require('../controllers/skillController');

const router = express.Router();

router.use(authMiddleware);
router.get('/gaps', getSkillGaps);

module.exports = router;
