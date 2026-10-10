const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidMobileNumber, positiveInteger } = require('../src/utils/validation');

test('mobile validation accepts optional international and formatted numbers', () => {
  assert.equal(isValidMobileNumber(''), true);
  assert.equal(isValidMobileNumber('+91 98765-43210'), true);
  assert.equal(isValidMobileNumber('(555) 123-4567'), true);
  assert.equal(isValidMobileNumber('1234567'), true);
});

test('mobile validation rejects malformed values and out-of-range digit counts', () => {
  for (const value of [1234567890, '123456', '1234567890123456', 'abc1234567', '+ (555)1234567']) {
    assert.equal(isValidMobileNumber(value), false, `expected ${String(value)} to be rejected`);
  }
});

test('positive integer route/query validation rejects unsafe and non-integer values', () => {
  assert.equal(positiveInteger('42', 'id'), 42);
  for (const value of ['', '0', '-1', '1.5', 'Infinity', Number.MAX_SAFE_INTEGER + 1, true, []]) {
    assert.throws(() => positiveInteger(value, 'id'), { statusCode: 400 });
  }
});
