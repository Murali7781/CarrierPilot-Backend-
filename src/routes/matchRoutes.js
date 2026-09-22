const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { analyzeMatch, listMatches, getMatch } = require('../controllers/matchController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listMatches);
router.post('/analyze', analyzeMatch);
router.get('/:id', getMatch);

module.exports = router;
