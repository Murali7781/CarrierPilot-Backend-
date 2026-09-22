const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getPreferences, updatePreferences } = require('../controllers/preferenceController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', getPreferences);
router.put('/', updatePreferences);
module.exports = router;
