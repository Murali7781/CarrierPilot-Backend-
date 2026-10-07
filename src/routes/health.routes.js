const express = require('express');
const { testDatabaseConnection } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await testDatabaseConnection();
    return res.status(200).json({
      success: true,
      message: 'CareerPilot API is running',
      database: 'connected',
    });
  } catch (error) {
    console.error('Database health check failed:', error.code || 'UNKNOWN');
    return res.status(503).json({
      success: false,
      message: 'CareerPilot API is unavailable',
      database: 'disconnected',
    });
  }
});

module.exports = router;
