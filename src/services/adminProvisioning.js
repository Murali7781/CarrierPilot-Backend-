'use strict';

const bcrypt = require('bcryptjs');

function validateAdminConfiguration(config) {
  if (config.ADMIN_PROVISION_ENABLED !== 'true') {
    throw new Error('Set ADMIN_PROVISION_ENABLED=true for this explicit provisioning command.');
  }
  const name = typeof config.ADMIN_NAME === 'string' ? config.ADMIN_NAME.trim() : '';
  const email = typeof config.ADMIN_EMAIL === 'string' ? config.ADMIN_EMAIL.trim().toLowerCase() : '';
  const password = typeof config.ADMIN_PASSWORD === 'string' ? config.ADMIN_PASSWORD : '';
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error('Set valid ADMIN_NAME and ADMIN_EMAIL values.');
  }
  if (password.length < 16 || Buffer.byteLength(password, 'utf8') > 72 || /replace-with|placeholder|example/i.test(password)) {
    throw new Error('ADMIN_PASSWORD must be a unique secret of 16 to 72 bytes and must not be a placeholder.');
  }
  return { name, email, password };
}

async function provisionAdmin({ pool, config = process.env, hashPassword = bcrypt.hash }) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A database pool is required.');
  const { name, email, password } = validateAdminConfiguration(config);
  const [existing] = await pool.query('SELECT id, role FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) {
    if (String(existing[0].role).toLowerCase() === 'admin') return { created: false, reason: 'already-admin' };
    throw new Error('The configured email already belongs to a non-administrator account; no changes were made.');
  }
  const passwordHash = await hashPassword(password, 12);
  await pool.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, passwordHash, 'admin']);
  return { created: true };
}

module.exports = { provisionAdmin, validateAdminConfiguration };
