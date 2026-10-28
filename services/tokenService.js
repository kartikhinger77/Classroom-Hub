const jwt = require('jsonwebtoken');
const { randomToken, hashToken } = require('../utils/crypto');
const env = require('../config/env');
const Session = require('../models/Session');
const { accessTokenTtl, refreshDays } = require('../config/constants');

const ISSUER = 'classroom-hub';
const AUDIENCE = 'classroom-hub-web';

function signAccess(user, sessionId) {
  return jwt.sign({ sub: String(user._id), role: user.role, sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', expiresIn: accessTokenTtl, issuer: ISSUER, audience: AUDIENCE
  });
}

function verifyAccess(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
}

function signRefresh(user, sessionId) {
  return jwt.sign({ sub: String(user._id), sid: String(sessionId), jti: randomToken(24) }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256', expiresIn: `${refreshDays}d`, issuer: ISSUER, audience: AUDIENCE
  });
}

function verifyRefresh(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
}

async function createSession(user, req) {
  const session = new Session({
    user: user._id,
    refreshTokenHash: 'pending',
    userAgent: String(req.get('user-agent') || 'unknown').slice(0, 300),
    ip: String(req.ip || '').slice(0, 64),
    expiresAt: new Date(Date.now() + refreshDays * 86400000)
  });
  const refreshToken = signRefresh(user, session._id);
  session.refreshTokenHash = hashToken(refreshToken);
  await session.save();
  return { session, accessToken: signAccess(user, session._id), refreshToken };
}

async function rotateSession(token) {
  const claims = verifyRefresh(token);
  const session = await Session.findById(claims.sid).select('+refreshTokenHash');
  if (!session || session.user.toString() !== claims.sub || session.revokedAt || session.expiresAt <= new Date()) {
    throw new Error('Invalid refresh token.');
  }
  if (session.refreshTokenHash !== hashToken(token)) {
    session.revokedAt = new Date();
    await session.save();
    throw new Error('Refresh token reuse detected.');
  }
  const user = await require('../models/User').findById(session.user).select('_id name email role status mustChangePassword');
  if (!user || user.status !== 'active') {
    session.revokedAt = new Date();
    await session.save();
    throw new Error('Invalid refresh token.');
  }
  const nextRefresh = signRefresh(user, session._id);
  session.refreshTokenHash = hashToken(nextRefresh);
  session.expiresAt = new Date(Date.now() + refreshDays * 86400000);
  await session.save();
  return { session, user, accessToken: signAccess(user, session._id), refreshToken: nextRefresh };
}

module.exports = { signAccess, verifyAccess, signRefresh, verifyRefresh, createSession, rotateSession };
