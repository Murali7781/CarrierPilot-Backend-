const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { getPreferences, updatePreferences } = require('../controllers/preferenceController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', requirePermission('preferences.view'), getPreferences);
router.put('/', requirePermission('preferences.update'), updatePreferences);
module.exports = router;
