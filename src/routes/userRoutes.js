const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { getProfile, updateProfile } = require('../controllers/userController');

const router = express.Router();

router.use(authMiddleware);
router.get('/profile', requirePermission('profile.view'), getProfile);
router.put('/profile', requirePermission('profile.update'), updateProfile);

module.exports = router;
