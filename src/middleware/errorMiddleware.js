function errorMiddleware(err, req, res, next) {
  let statusCode = err && err.statusCode ? err.statusCode : 500;

  if (err && err.code === 'LIMIT_FILE_SIZE') statusCode = 413;
  if (err && err.code === 'LIMIT_FILE_COUNT') statusCode = 400;
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') statusCode = 400;

  if (statusCode >= 500) {
    console.error('Server error:', err && err.stack ? err.stack : err);
  }

  let message = statusCode >= 500 ? 'Something went wrong. Please try again later.' : (err?.message || 'Something went wrong');

  if (err && err.code === 'ER_DUP_ENTRY') {
    message = 'A duplicate record already exists.';
  }

  if (Number.isInteger(err?.retryAfterSeconds) && err.retryAfterSeconds > 0) {
    res.set('Retry-After', String(err.retryAfterSeconds));
  }

  const payload = {
    success: false,
    message,
  };
  if (err?.providerError && typeof err.providerError === 'object') {
    const { status, type, code } = err.providerError;
    payload.providerError = {
      status: Number.isInteger(status) ? status : null,
      type: typeof type === 'string' ? type : null,
      code: typeof code === 'string' ? code : null,
    };
  }

  res.status(statusCode).json(payload);
}

module.exports = errorMiddleware;
