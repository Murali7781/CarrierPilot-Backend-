const { errorResponse } = require('../utils/response');

function authRateLimit({ limit, windowMs, message }) {
  const attempts = new Map();
  let requestsUntilCleanup = 0;
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = attempts.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      attempts.set(key, record);
    }

    record.count += 1;
    if ((requestsUntilCleanup += 1) >= 500) {
      requestsUntilCleanup = 0;
      for (const [address, item] of attempts) if (item.resetAt <= now) attempts.delete(address);
    }

    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - record.count)));
    res.set('RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > limit) {
      res.set('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json(errorResponse(message, 429));
    }

    return next();
  };
}

module.exports = authRateLimit;
