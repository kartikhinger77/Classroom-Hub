const { fail } = require('../utils/response');

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) return fail(res, 403, 'FORBIDDEN', 'You do not have permission to do that.');
    return next();
  };
}

module.exports = { requireRole };
