const requiredEnvironmentVariables = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
];

function validateEnvironment() {
  const missingVariables = requiredEnvironmentVariables.filter(
    (variable) => !process.env[variable]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingVariables.join(', ')}`);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  if (jwtSecret.includes('replace-with-')) {
    throw new Error('JWT_SECRET must be replaced with a real random secret.');
  }

  const databasePort = Number(process.env.DB_PORT);
  if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
    throw new Error('DB_PORT must be a valid port number between 1 and 65535.');
  }

  if (process.env.NODE_ENV === 'production' && process.env.DB_USER.toLowerCase() === 'root') {
    throw new Error('DB_USER must be a least-privileged application database user, not root.');
  }

  if (process.env.PORT !== undefined) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be a valid port number between 1 and 65535.');
    }
  }
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return process.env.JWT_SECRET;
}

module.exports = {
  getJwtSecret,
  validateEnvironment,
};
