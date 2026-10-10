const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOrigin } = require('../src/config/originPolicy');

test('development origins are unavailable to production cookie and CORS checks', (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });

  process.env.NODE_ENV = 'production';
  assert.equal(isAllowedOrigin('http://localhost:5173'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), false);
  assert.equal(isAllowedOrigin('https://carrirepilot-frontend.vercel.app'), true);
  assert.equal(
    isAllowedOrigin('https://carrirepilot-frontend-feature-murali7781s-projects.vercel.app'),
    true,
  );
});

test('development origins remain available outside production', (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });

  process.env.NODE_ENV = 'development';
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), true);
});
