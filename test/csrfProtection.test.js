const test = require('node:test');
const assert = require('node:assert/strict');
const csrfProtection = require('../src/middleware/csrfProtection');

function invoke(request) {
  let statusCode;
  let body;
  let continued = false;
  const response = {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return this; },
  };

  csrfProtection(request, response, () => { continued = true; });
  return { statusCode, body, continued };
}

test('cookie-authenticated mutations require an explicitly allowed browser origin', () => {
  const blocked = invoke({
    method: 'POST',
    headers: { cookie: 'careerpilot_session=token', origin: 'https://attacker.example' },
  });
  const missingOrigin = invoke({
    method: 'DELETE',
    headers: { cookie: 'careerpilot_session=token' },
  });
  const allowed = invoke({
    method: 'PATCH',
    headers: { cookie: 'careerpilot_session=token', origin: 'http://localhost:5173' },
  });

  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.success, false);
  assert.equal(missingOrigin.statusCode, 403);
  assert.equal(allowed.continued, true);
});

test('safe methods and requests without a session cookie do not require a browser origin', () => {
  assert.equal(invoke({ method: 'GET', headers: { cookie: 'careerpilot_session=token' } }).continued, true);
  assert.equal(invoke({ method: 'POST', headers: { authorization: 'Bearer token' } }).continued, true);
});
