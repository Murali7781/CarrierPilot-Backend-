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

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = errorMiddleware;
