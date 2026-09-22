const requiredEnvironmentVariables = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PORT'];

function validateEnvironment() {
  const missingVariables = requiredEnvironmentVariables.filter((variable) => !process.env[variable]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  if (process.env.JWT_SECRET.includes('replace-with-')) {
    throw new Error('JWT_SECRET must be replaced with a real random secret.');
  }

  if (process.env.NODE_ENV === 'production' && process.env.DB_USER.toLowerCase() === 'root') {
    throw new Error('DB_USER must be a least-privileged application database user, not root.');
  }

  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.includes('replace-with-')) {
    throw new Error('DB_PASSWORD must be replaced with the application database password.');
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
