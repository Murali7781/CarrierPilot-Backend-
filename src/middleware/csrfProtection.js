const { errorResponse } = require('../utils/response');
const { isAllowedOrigin } = require('../config/originPolicy');

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasSessionCookie(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .some((cookie) => cookie.trim().startsWith('careerpilot_session='));
}

function csrfProtection(req, res, next) {
  if (
    !unsafeMethods.has(req.method) ||
    !hasSessionCookie(req.headers.cookie) ||
    isAllowedOrigin(req.headers.origin)
  ) {
    return next();
  }

  return res.status(403).json(
    errorResponse('This request origin is not allowed.', 403),
  );
}

module.exports = csrfProtection;
