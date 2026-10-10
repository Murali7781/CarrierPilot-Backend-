const test = require('node:test');
const assert = require('node:assert/strict');
const { errorResponse } = require('../src/utils/response');
const errorMiddleware = require('../src/middleware/errorMiddleware');

test('validation failures use the common API error envelope', () => {
  assert.deepEqual(errorResponse('Invalid input.', 422), {
    success: false,
    message: 'Invalid input.',
    code: 'HTTP_422',
    errors: [],
  });
});

test('internal failures do not expose the underlying error message', () => {
  let response;
  let status;
  const previousLogger = console.error;

  try {
    console.error = () => {};
    errorMiddleware(
      Object.assign(new Error('DB_PASSWORD=private-value'), { statusCode: 500 }),
      {},
      {
        status(value) { status = value; return this; },
        json(value) { response = value; return this; },
      },
      () => {},
    );
  } finally {
    console.error = previousLogger;
  }

  assert.equal(status, 500);
  assert.deepEqual(response, {
    success: false,
    message: 'Something went wrong. Please try again later.',
    code: 'INTERNAL_SERVER_ERROR',
    errors: [],
  });
  assert.doesNotMatch(JSON.stringify(response), /private-value/);
});
