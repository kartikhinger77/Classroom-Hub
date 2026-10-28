const { rateLimit } = require('express-rate-limit');
const { fail } = require('../utils/response');

function limit(max, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit: process.env.NODE_ENV === 'test' ? 10000 : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_req, res) { return fail(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.'); }
  });
}

module.exports = { globalLimiter: limit(300, 15 * 60 * 1000), authLimiter: limit(10), uploadLimiter: limit(30), limit };
