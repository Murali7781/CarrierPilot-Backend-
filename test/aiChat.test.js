const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCareerAdvice } = require('../src/services/ai/aiService');
const errorMiddleware = require('../src/middleware/errorMiddleware');

function mockResponsesApi(result) {
  return { responses: { create: async () => {
    if (result instanceof Error) throw result;
    return result;
  } } };
}

function createProviderError({ status = 429, type, code, retryAfter }) {
  const headers = new Headers();
  if (retryAfter) headers.set('retry-after', retryAfter);
  const error = new Error('Provider error details must not be returned to the user.');
  error.status = status;
  error.error = { type, code, message: 'Sensitive raw provider message' };
  error.headers = headers;
  return error;
}

function captureErrorResponse(error) {
  let statusCode;
  const headers = {};
  let body;
  const res = {
    status(value) { statusCode = value; return this; },
    set(name, value) { headers[name] = value; return this; },
    json(value) { body = value; return this; },
  };
  errorMiddleware(error, {}, res, () => {});
  return { statusCode, headers, body };
}

const request = { message: 'How should I tailor my resume?', candidateContext: '{}' };
const silentLogger = { error() {} };

test('quota exhaustion returns a billing action and preserves sanitized provider fields', async () => {
  const providerError = createProviderError({ type: 'insufficient_quota', code: 'insufficient_quota' });
  await assert.rejects(
    generateCareerAdvice(request, { client: mockResponsesApi(providerError), logger: silentLogger }),
    (error) => {
      const result = captureErrorResponse(error);
      assert.equal(result.statusCode, 429);
      assert.match(result.body.message, /quota or credits are exhausted/i);
      assert.match(result.body.message, /cannot be fixed by retrying/i);
      assert.deepEqual(result.body.providerError, { status: 429, type: 'insufficient_quota', code: 'insufficient_quota' });
      assert.doesNotMatch(JSON.stringify(result.body), /Sensitive raw provider message/);
      return true;
    },
  );
});

test('temporary request rate limit returns wait guidance and Retry-After', async () => {
  const providerError = createProviderError({ type: 'requests', code: 'rate_limit_exceeded', retryAfter: '7' });
  await assert.rejects(
    generateCareerAdvice(request, { client: mockResponsesApi(providerError), logger: silentLogger }),
    (error) => {
      const result = captureErrorResponse(error);
      assert.equal(result.statusCode, 429);
      assert.match(result.body.message, /temporarily rate-limited/i);
      assert.match(result.body.message, /Wait 7 seconds/i);
      assert.deepEqual(result.body.providerError, { status: 429, type: 'requests', code: 'rate_limit_exceeded' });
      assert.equal(result.headers['Retry-After'], '7');
      return true;
    },
  );
});

test('successful Responses API text is returned as an OpenAI answer', async () => {
  const result = await generateCareerAdvice(request, {
    client: mockResponsesApi({ output_text: 'Lead with the experience most relevant to the target role.' }),
    logger: silentLogger,
  });
  assert.deepEqual(result, {
    response: 'Lead with the experience most relevant to the target role.',
    mode: 'openai',
    notice: '',
  });
});
