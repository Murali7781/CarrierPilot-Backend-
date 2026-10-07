require('dotenv').config();

const { validateEnvironment } = require('./src/config/environment');

async function startServer() {
  console.log('CareerPilot API starting...');

  try {
    validateEnvironment();
  } catch (error) {
    console.error('ENVIRONMENT CONFIGURATION FAILED');
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log('Environment validation passed');

  const { testDatabaseConnection, initializeDatabase, pool } = require('./src/config/db');
  try {
    await testDatabaseConnection();
  } catch (error) {
    console.error('DATABASE CONNECTION FAILED');
    console.error(getDatabaseFailureMessage(error));
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log('MySQL connection successful');

  try {
    await initializeDatabase();
  } catch (error) {
    console.error('DATABASE INITIALIZATION FAILED');
    console.error(error.code || 'Database initialization could not be completed.');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log('Database initialization completed');

  const app = require('./src/app');
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`CareerPilot server running on port ${port}`);
  });

  server.on('error', (error) => {
    console.error('SERVER STARTUP FAILED');
    console.error(error.code || 'The HTTP server could not start.');
    process.exitCode = 1;
  });
}

function getDatabaseFailureMessage(error) {
  switch (error.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Database hostname could not be resolved (${error.code}). Verify DB_HOST against the Aiven service connection details and confirm the service is available.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return 'The database rejected the configured credentials. Verify DB_USER and DB_PASSWORD in Render.';
    case 'ER_BAD_DB_ERROR':
      return 'The configured database does not exist or is not accessible. Verify DB_NAME in Render.';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `The database connection failed (${error.code}). Verify DB_HOST, DB_PORT, Aiven service availability, and network access.`;
    default:
      return `The database connection failed${error.code ? ` (${error.code})` : ''}. Check the Render and Aiven connection settings.`;
  }
}

startServer();