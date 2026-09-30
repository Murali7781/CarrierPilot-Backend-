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

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = errorMiddleware;
