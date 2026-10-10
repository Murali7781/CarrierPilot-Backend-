function successResponse(message, data = {}) {
  return {
    success: true,
    message,
    data,
  };
}

function errorResponse(message, statusCode) {
  return {
    success: false,
    message,
    code: Number.isInteger(statusCode) ? `HTTP_${statusCode}` : 'REQUEST_FAILED',
    errors: [],
  };
}

module.exports = {
  successResponse,
  errorResponse,
};
