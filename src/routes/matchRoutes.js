const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { analyzeMatch, listMatches, getMatch } = require('../controllers/matchController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', requirePermission('matches.view'), listMatches);
router.post('/analyze', requirePermission('matches.analyze'), analyzeMatch);
router.get('/:id', requirePermission('matches.view'), getMatch);

module.exports = router;
