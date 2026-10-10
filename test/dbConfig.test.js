const test = require('node:test');
const assert = require('node:assert/strict');
const { getDatabaseConfig } = require('../src/config/db');

test('production MySQL connections verify TLS certificates', () => {
  const names = ['NODE_ENV', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'db.example.test',
      DB_USER: 'careerpilot',
      DB_PASSWORD: 'test-password',
      DB_NAME: 'careerpilot',
      DB_PORT: '3306',
    });

    assert.deepEqual(getDatabaseConfig().ssl, { rejectUnauthorized: true });
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('local MySQL remains compatible with servers that do not use TLS', () => {
  const names = ['NODE_ENV', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: 'development',
      DB_HOST: '127.0.0.1',
      DB_USER: 'careerpilot',
      DB_PASSWORD: 'test-password',
      DB_NAME: 'careerpilot',
      DB_PORT: '3306',
    });
    assert.equal(getDatabaseConfig().ssl, undefined);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
