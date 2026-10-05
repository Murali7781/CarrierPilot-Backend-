function errorMiddleware(err, req, res, next) {
  const statusCode = err && err.statusCode ? err.statusCode : 500;

  if (statusCode >= 500) {
    console.error('Server error:', err && err.stack ? err.stack : err);
  }

  let message = 'Something went wrong';

  if (err && err.message) {
    message = err.message;
  }

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
