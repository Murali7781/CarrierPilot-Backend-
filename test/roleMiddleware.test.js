const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, requirePermission } = require('../src/middleware/roleMiddleware');

function createResponse() {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    getStatus() {
      return statusCode;
    },
    getBody() {
      return body;
    },
  };
}

test('authorize allows only the permitted roles', () => {
  let called = false;
  const req = { user: { role: 'candidate' } };
  const res = createResponse();
  const next = () => { called = true; };

  authorize('candidate', 'admin')(req, res, next);

  assert.equal(called, true);
  assert.equal(res.getStatus(), undefined);
});

test('authorize rejects roles outside the allowed set', () => {
  let called = false;
  const req = { user: { role: 'recruiter' } };
  const res = createResponse();
  const next = () => { called = true; };

  authorize('candidate', 'admin')(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatus(), 403);
  assert.match(res.getBody().message, /Access denied/i);
});

test('authorize denies a route that has no configured role policy', () => {
  let called = false;
  const res = createResponse();

  authorize()({ user: { role: 'admin' } }, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.getStatus(), 403);
});

test('permissions allow candidate workflows but keep recruiter resources isolated', () => {
  let candidatePassed = false;
  let recruiterPassed = false;
  const candidateResponse = createResponse();
  const recruiterResponse = createResponse();

  requirePermission('resumes.view')({ user: { role: 'candidate' } }, candidateResponse, () => { candidatePassed = true; });
  requirePermission('applications.view')({ user: { role: 'recruiter' } }, recruiterResponse, () => { recruiterPassed = true; });

  assert.equal(candidatePassed, true);
  assert.equal(recruiterPassed, false);
  assert.equal(recruiterResponse.getStatus(), 403);
});

test('permissions reject unknown roles, unknown permissions, and missing policy', () => {
  const cases = [
    { user: { role: 'support' }, permission: 'jobs.view' },
    { user: { role: 'toString' }, permission: 'jobs.view' },
    { user: { role: 'candidate' }, permission: 'users.delete' },
    { user: { role: 'admin' }, permission: undefined },
  ];

  for (const { user, permission } of cases) {
    let called = false;
    const res = createResponse();
    requirePermission(...(permission ? [permission] : []))( { user }, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.getStatus(), 403);
  }
});
