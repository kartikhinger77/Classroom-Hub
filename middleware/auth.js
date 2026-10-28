const { verifyAccess } = require('../services/tokenService');
const User = require('../models/User');
const Session = require('../models/Session');
const { fail } = require('../utils/response');

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
    const claims = verifyAccess(header.slice(7));
    const [user, session] = await Promise.all([
      User.findById(claims.sub).select('_id name email role status mustChangePassword').lean(),
      Session.findById(claims.sid).select('_id user revokedAt expiresAt').lean()
    ]);
    if (!user || user.status !== 'active' || !session || session.revokedAt || session.expiresAt <= new Date() || String(session.user) !== String(user._id)) {
      return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
    }
    req.user = user;
    req.sessionId = session._id;
    if (user.mustChangePassword) {
      const permitted = req.method === 'GET' && req.originalUrl.startsWith('/api/account/me')
        || req.method === 'PATCH' && req.originalUrl.startsWith('/api/account/password');
      if (!permitted) return fail(res, 403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.');
    }
    return next();
  } catch (_error) {
    return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  }
}

async function optionalAuthenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) {
      const claims = verifyAccess(header.slice(7));
      const [user, session] = await Promise.all([
        User.findById(claims.sub).select('_id name email role status').lean(),
        Session.findById(claims.sid).select('_id user revokedAt expiresAt').lean()
      ]);
      if (user?.status === 'active' && session && !session.revokedAt && session.expiresAt > new Date() && String(session.user) === String(user._id)) req.user = user;
    }
  } catch (_error) { /* Logout still clears a cookie when the access token is expired. */ }
  return next();
}

module.exports = { authenticate, optionalAuthenticate };
