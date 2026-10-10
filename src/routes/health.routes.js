const express = require('express');
const { testDatabaseConnection } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await testDatabaseConnection();
    return res.status(200).json(successResponse('CareerPilot API is running', { database: 'connected' }));
  } catch (error) {
    console.error('Database health check failed:', error.code || 'UNKNOWN');
    return res.status(503).json({
      ...errorResponse('CareerPilot API is unavailable', 503),
      data: { database: 'disconnected' },
    });
  }
});

module.exports = router;
