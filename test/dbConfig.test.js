const test = require('node:test');
const assert = require('node:assert/strict');
const { rootCertificates } = require('node:tls');
const { getDatabaseConfig } = require('../src/config/db');

const caCertificate = rootCertificates[0];

function withEnvironment(values, callback) {
  const names = [...new Set([
    'NODE_ENV', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT', 'DB_CA_CERT',
    ...Object.keys(values),
  ])];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'db.example.test',
      DB_USER: 'careerpilot',
      DB_PASSWORD: 'test-password',
      DB_NAME: 'careerpilot',
      DB_PORT: '3306',
      ...values,
    });
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('production MySQL connections use the supplied CA and verify TLS certificates', () => {
  withEnvironment({ DB_CA_CERT: caCertificate }, () => {
    assert.deepEqual(getDatabaseConfig().ssl, {
      ca: caCertificate,
      rejectUnauthorized: true,
    });
  });
});

test('production MySQL configuration fails safely when the CA is missing', () => {
  withEnvironment({}, () => {
    assert.throws(
      () => getDatabaseConfig(),
      { message: 'DB_CA_CERT is required in production for verified MySQL TLS connections.' },
    );
  });
});

test('production MySQL configuration rejects an invalid CA without exposing its value', () => {
  const invalidCertificate = '-----BEGIN CERTIFICATE-----\nnot-a-valid-certificate\n-----END CERTIFICATE-----';
  withEnvironment({ DB_CA_CERT: invalidCertificate }, () => {
    assert.throws(
      () => getDatabaseConfig(),
      (error) => error.message === 'DB_CA_CERT must contain a valid PEM-encoded CA certificate in production.'
        && !error.message.includes(invalidCertificate),
    );
  });
});

test('local MySQL remains compatible with servers that do not use TLS', () => {
  withEnvironment({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_USER: 'careerpilot',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'careerpilot',
    DB_PORT: '3306',
  }, () => {
    assert.equal(getDatabaseConfig().ssl, undefined);
  });
});
