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
    const { code, message } = formatSafeDatabaseError(error);
    console.error(`Error Code: ${code}`);
    console.error(`Error Message: ${message}`);
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
    const { code, message } = formatSafeDatabaseError(error);
    console.error(`Error Code: ${code}`);
    console.error(`Error Message: ${message}`);
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

function formatSafeDatabaseError(error) {
  if (!error) {
    return { code: 'UNKNOWN_ERROR', message: 'An unknown database error occurred.' };
  }

  const code = error.code || error.name || 'ERR_DATABASE_CONNECTION';
  let message = error.message || 'No specific error message provided.';

  message = message
    .replace(/(password|pwd|pass)[:=][^\s&;]+/gi, '$1=***')
    .replace(/(:\/\/)([^:@\s]+):([^@\s]+)@/g, '$1$2:***@')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g, '[REDACTED CERTIFICATE]');

  return { code, message };
}

function getDatabaseFailureMessage(error) {
  const code = error?.code;
  const message = error?.message || '';

  const isTlsError = [
    'HANDSHAKE_SSL_ERROR',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'CERT_NOT_YET_VALID',
    'ERR_CRYPTO_CUSTOM_CERT',
  ].includes(code) || /certificate|TLS|SSL/i.test(message);

  if (isTlsError) {
    return `TLS certificate verification failed${code ? ` (${code})` : ''}. Verify DB_CA_CERT in Render matches the Aiven CA certificate (ca.pem).`;
  }

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Database hostname could not be resolved (${code}). Verify DB_HOST against the Aiven service connection details and confirm the service is available.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return 'The database rejected the configured credentials. Verify DB_USER and DB_PASSWORD in Render.';
    case 'ER_BAD_DB_ERROR':
      return 'The configured database does not exist or is not accessible. Verify DB_NAME in Render.';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `The database connection failed (${code}). Verify DB_HOST, DB_PORT, Aiven service availability, and network access.`;
    default:
      if (message.includes('DB_CA_CERT')) {
        return `${message} Verify DB_CA_CERT in Render environment settings.`;
      }
      return `The database connection failed${code ? ` (${code})` : ''}. Check the Render and Aiven connection settings.`;
  }
}

startServer();