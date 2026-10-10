'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { provisionAdmin, validateAdminConfiguration } = require('../src/services/adminProvisioning');

const config = { ADMIN_PROVISION_ENABLED: 'true', ADMIN_NAME: 'Admin1234', ADMIN_EMAIL: 'admin@gmail.com', ADMIN_PASSWORD: 'unique-secure-admin-secret' };

test('admin provisioning requires explicit enablement and a strong non-placeholder secret', () => {
  assert.throws(() => validateAdminConfiguration({ ...config, ADMIN_PROVISION_ENABLED: 'false' }), /explicit provisioning/);
  assert.throws(() => validateAdminConfiguration({ ...config, ADMIN_PASSWORD: 'short' }), /16 to 72 bytes/);
  assert.throws(() => validateAdminConfiguration({ ...config, ADMIN_PASSWORD: 'replace-with-a-unique-secret' }), /placeholder/);
});

test('an existing administrator is left unchanged', async () => {
  const calls = [];
  const result = await provisionAdmin({ pool: { query: async (...args) => { calls.push(args); return [[{ id: 7, role: 'admin' }]]; } }, config });
  assert.deepEqual(result, { created: false, reason: 'already-admin' });
  assert.equal(calls.length, 1);
});

test('an existing non-admin account is never promoted', async () => {
  const pool = { query: async () => [[{ id: 8, role: 'candidate' }]] };
  await assert.rejects(provisionAdmin({ pool, config }), /no changes were made/);
});

test('new administrator is inserted with a server-side hash and fixed admin role', async () => {
  const calls = [];
  const pool = { query: async (...args) => { calls.push(args); return calls.length === 1 ? [[]] : [{ affectedRows: 1 }]; } };
  const result = await provisionAdmin({ pool, config, hashPassword: async (password, rounds) => 'hash-' + rounds + '-' + password });
  assert.deepEqual(result, { created: true });
  assert.deepEqual(calls[1], ['INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Admin1234', 'admin@gmail.com', 'hash-12-unique-secure-admin-secret', 'admin']]);
});
