const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { chatWithAi } = require('../controllers/aiController');

const router = express.Router();

router.use(authMiddleware);
router.post('/chat', chatWithAi);

module.exports = router;
