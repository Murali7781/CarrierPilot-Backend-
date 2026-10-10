function positiveInteger(value, fieldName = 'value') {
  if (value === null || value === undefined || value === '') {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }

  if (typeof value === 'boolean' || Array.isArray(value)) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }

  const normalised = typeof value === 'string' ? value.trim() : String(value);

  if (!/^[0-9]+$/.test(normalised)) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }

  const parsed = Number(normalised);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function isValidMobileNumber(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;

  const mobile = value.trim();
  const digits = mobile.replace(/\D/g, '').length;
  return mobile.length <= 20 && digits >= 7 && digits <= 15 &&
    /^\+?(?:[0-9]|\([0-9]{1,4}\))[0-9 ().-]*[0-9]$/.test(mobile);
}

module.exports = {
  positiveInteger,
  isValidMobileNumber,
};
