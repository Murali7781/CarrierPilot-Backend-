const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const { register, login, logout } = require('../src/controllers/authController');
const authMiddleware = require('../src/middleware/authMiddleware');

const secret = 'careerpilot-isolated-test-secret-32-characters';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    cookieValue: null,
    cookieOptions: null,
    clearedCookie: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookieName = name; this.cookieValue = value; this.cookieOptions = options; return this; },
    clearCookie(name, options) { this.clearedCookie = { name, options }; return this; },
  };
}

function makeToken(claims, options = {}) {
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    issuer: 'careerpilot-api',
    audience: 'careerpilot-web',
    expiresIn: '1h',
    ...options,
  });
}

test('registration ignores a requested privileged role and stores a bcrypt hash', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  const originalQuery = pool.query;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    pool.query = originalQuery;
  });

  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = 'test';
  let insertedValues;
  pool.query = async (sql, values) => {
    assert.match(sql, /INSERT INTO users/);
    insertedValues = values;
    return [{ insertId: 73 }, []];
  };

  const missingConfirmationResponse = createResponse();
  await register({ body: { name: 'Candidate', email: 'candidate@example.com', password: 'correct-horse-battery', role: 'admin' } }, missingConfirmationResponse, assert.fail);
  assert.equal(missingConfirmationResponse.statusCode, 400);
  assert.equal(insertedValues, undefined);

  const mismatchResponse = createResponse();
  await register({ body: { name: 'Candidate', email: 'candidate@example.com', password: 'correct-horse-battery', confirmPassword: 'different-password', role: 'admin' } }, mismatchResponse, assert.fail);
  assert.equal(mismatchResponse.statusCode, 400);
  assert.equal(insertedValues, undefined);

  const response = createResponse();
  await register({ body: { name: 'Candidate', email: 'candidate@example.com', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', role: 'admin' } }, response, assert.fail);

  assert.equal(response.statusCode, 201);
  assert.equal(insertedValues[4], 'candidate');
  assert.notEqual(insertedValues[2], 'correct-horse-battery');
  assert.equal(response.body.data.user.role, 'candidate');
  assert.equal(response.cookieName, 'careerpilot_session');
  assert.equal(response.cookieOptions.httpOnly, true);
  assert.equal(jwt.verify(response.cookieValue, secret, { issuer: 'careerpilot-api', audience: 'careerpilot-web' }).role, 'candidate');
});

test('login rejects unsupported database roles and issues a cookie only for an allowed role', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  const originalQuery = pool.query;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    pool.query = originalQuery;
  });

  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = 'test';
  const password = 'correct-horse-battery';
  const passwordHash = await bcrypt.hash(password, 4);
  pool.query = async (_sql, values) => [[{
    id: values[0] === 'unknown@example.com' ? 91 : 92,
    name: 'User',
    email: values[0],
    password: passwordHash,
    mobile: null,
    role: values[0] === 'unknown@example.com' ? 'support' : 'recruiter',
    token_version: 0,
  }]];

  const invalidRoleResponse = createResponse();
  await login({ body: { email: 'unknown@example.com', password } }, invalidRoleResponse, assert.fail);
  assert.equal(invalidRoleResponse.statusCode, 403);
  assert.equal(invalidRoleResponse.cookieValue, null);

  const allowedRoleResponse = createResponse();
  await login({ body: { email: 'recruiter@example.com', password } }, allowedRoleResponse, assert.fail);
  assert.equal(allowedRoleResponse.statusCode, 200);
  assert.equal(allowedRoleResponse.body.data.user.role, 'recruiter');
  assert.ok(allowedRoleResponse.cookieValue);
});

test('authentication rejects missing, invalid, expired, unknown, changed-role, and revoked sessions', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const originalQuery = pool.query;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    pool.query = originalQuery;
  });

  process.env.JWT_SECRET = secret;
  const invoke = async (headers, rows = []) => {
    let continued = false;
    let nextError;
    const req = { headers };
    const res = createResponse();
    await authMiddleware(req, res, (error) => { continued = true; nextError = error; });
    return { req, res, continued, nextError };
  };

  assert.equal((await invoke({})).res.statusCode, 401);
  assert.equal((await invoke({ authorization: 'Bearer invalid' })).res.statusCode, 401);

  const expired = makeToken({ id: 8, role: 'candidate', tokenVersion: 0 }, { expiresIn: '-1s' });
  assert.equal((await invoke({ authorization: `Bearer ${expired}` })).res.statusCode, 401);

  const valid = makeToken({ id: 8, role: 'candidate', tokenVersion: 0 });
  pool.query = async () => [[]];
  assert.equal((await invoke({ authorization: `Bearer ${valid}` })).res.statusCode, 401);

  pool.query = async () => [[{ id: 8, name: 'User', email: 'user@example.com', role: 'recruiter', token_version: 0 }]];
  assert.equal((await invoke({ authorization: `Bearer ${valid}` })).res.statusCode, 401);

  const recruiterToken = makeToken({ id: 8, role: 'recruiter', tokenVersion: 0 });
  pool.query = async () => [[{ id: 8, name: 'User', email: 'user@example.com', role: 'recruiter', token_version: 2 }]];
  assert.equal((await invoke({ authorization: `Bearer ${recruiterToken}` })).res.statusCode, 401);

  pool.query = async () => [[{ id: 8, name: 'User', email: 'user@example.com', role: 'recruiter', token_version: 0 }]];
  const authenticated = await invoke({ authorization: `Bearer ${recruiterToken}` });
  assert.equal(authenticated.continued, true);
  assert.equal(authenticated.req.user.role, 'recruiter');

  const unsupportedRoleToken = makeToken({ id: 8, role: 'support', tokenVersion: 0 });
  pool.query = async () => [[{ id: 8, name: 'User', email: 'user@example.com', role: 'support', token_version: 0 }]];
  assert.equal((await invoke({ authorization: `Bearer ${unsupportedRoleToken}` })).res.statusCode, 401);
});

test('logout increments the database token version before clearing the session cookie', async (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  const originalQuery = pool.query;
  t.after(() => {
    pool.query = originalQuery;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });
  process.env.NODE_ENV = 'test';
  let query;
  pool.query = async (sql, values) => {
    query = { sql, values };
    return [{ affectedRows: 1 }, []];
  };

  const response = createResponse();
  await logout({ user: { id: 42 } }, response, assert.fail);

  assert.match(query.sql, /UPDATE users SET token_version = token_version \+ 1 WHERE id = \?/);
  assert.deepEqual(query.values, [42]);
  assert.deepEqual(response.clearedCookie, {
    name: 'careerpilot_session',
    options: { httpOnly: true, secure: false, sameSite: 'lax', path: '/api' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.signedOut, true);
});
