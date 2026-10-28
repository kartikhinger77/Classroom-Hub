const speakeasy = require('speakeasy');
const User = require('../models/User');
const Session = require('../models/Session');
const Setting = require('../models/Setting');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { createSession, rotateSession } = require('../services/tokenService');
const { randomToken, hashToken, encryptSecret } = require('../utils/crypto');
const { sendMail } = require('../services/mailService');
const env = require('../config/env');
const audit = require('../services/auditService');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');
const { recordFailedLogin } = require('../services/loginAttemptService');

const lockDurationMs = 15 * 60 * 1000;
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000
};

function setRefreshCookie(res, token) { res.cookie('refreshToken', token, refreshCookieOptions); }
function clearRefreshCookie(res) { res.clearCookie('refreshToken', { ...refreshCookieOptions, maxAge: undefined }); }

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!email.endsWith('@gmail.com')) return fail(res, 400, 'INVALID_INPUT', 'Use a Gmail address.');
    if (role !== 'student' && role !== 'teacher') return fail(res, 400, 'INVALID_INPUT', 'Choose Student or Teacher.');
    if (role === 'student') {
      const setting = await Setting.findOne({ key: 'studentSignupEnabled' }).lean();
      if (setting?.value === false) return fail(res, 403, 'SIGNUP_DISABLED', 'Student self sign-up is currently closed.');
    }
    const existing = await User.exists({ email });
    if (existing) return fail(res, 409, 'ACCOUNT_EXISTS', 'An account with that email already exists.');
    const verification = randomToken();
    const user = await User.create({
      name, email, role, passwordHash: await hashPassword(password),
      emailVerificationHash: hashToken(verification),
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    const link = `${env.PUBLIC_BASE_URL}/verify.html?token=${encodeURIComponent(verification)}`;
    await sendMail(email, 'Verify your Classroom Hub account', `Open this link to verify your account: ${link}`);
    return ok(res, { id: user._id, message: 'Check your email for a verification link.' }, 201);
  } catch (error) { return next(error); }
}

async function verifyEmail(req, res, next) {
  try {
    const tokenHash = hashToken(req.body.token);
    const pendingUser = await User.findOne({ pendingEmailVerificationHash: tokenHash, pendingEmailVerificationExpiresAt: { $gt: new Date() } })
      .select('+pendingEmail +pendingEmailVerificationHash +pendingEmailVerificationExpiresAt');
    if (pendingUser) {
      pendingUser.email = pendingUser.pendingEmail;
      pendingUser.emailVerifiedAt = new Date();
      pendingUser.pendingEmail = undefined;
      pendingUser.pendingEmailVerificationHash = undefined;
      pendingUser.pendingEmailVerificationExpiresAt = undefined;
      await pendingUser.save();
      return ok(res, { verified: true, emailChanged: true });
    }
    const user = await User.findOne({ emailVerificationHash: tokenHash, emailVerificationExpiresAt: { $gt: new Date() } }).select('+emailVerificationHash +emailVerificationExpiresAt');
    if (!user) return fail(res, 400, 'INVALID_TOKEN', 'That verification link is invalid or expired.');
    user.emailVerifiedAt = new Date();
    user.emailVerificationHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    return ok(res, { verified: true });
  } catch (error) { return next(error); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      await verifyPassword(password, null);
      await recordFailedLogin(req);
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      await verifyPassword(password, user.passwordHash);
      await recordFailedLogin(req);
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches || user.status !== 'active' || !user.emailVerifiedAt) {
      if (!matches) {
        user.failedLoginCount += 1;
        if (user.failedLoginCount >= 5) user.lockUntil = new Date(Date.now() + lockDurationMs);
        await user.save();
        await recordFailedLogin(req);
      }
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    user.failedLoginCount = 0;
    user.lockUntil = null;
    if (user.twoFactor.enabled) {
      const challenge = require('jsonwebtoken').sign({ sub: String(user._id), purpose: '2fa' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '5m', issuer: 'classroom-hub', audience: 'classroom-hub-2fa' });
      return ok(res, { requiresTwoFactor: true, challenge }, 202);
    }
    return completeLogin(user, req, res);
  } catch (error) { return next(error); }
}

async function verifyTwoFactor(req, res, next) {
  try {
    const jwt = require('jsonwebtoken');
    const challenge = jwt.verify(req.body.challenge, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'classroom-hub', audience: 'classroom-hub-2fa' });
    if (challenge.purpose !== '2fa') return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    const user = await User.findById(challenge.sub).select('+twoFactor.secretEncrypted');
    if (!user || !user.twoFactor.enabled || user.status !== 'active' || !user.emailVerifiedAt) return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    const secret = require('../utils/crypto').decryptSecret(user.twoFactor.secretEncrypted, env.DATA_ENCRYPTION_KEY);
    const verification = speakeasy.totp.verifyDelta({ secret, encoding: 'base32', token: req.body.code, window: 1 });
    if (verification === undefined || verification === null) {
      await recordFailedLogin(req);
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    const step = Math.floor(Date.now() / 30000) + verification.delta;
    const consumed = await User.updateOne({ _id: user._id, 'twoFactor.lastUsedStep': { $lt: step } }, { $set: { 'twoFactor.lastUsedStep': step } });
    if (!consumed.modifiedCount) return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    return completeLogin(user, req, res);
  } catch (_error) { return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.'); }
}

async function completeLogin(user, req, res) {
  user.lastLoginAt = new Date();
  user.failedLoginCount = 0;
  user.lockUntil = null;
  await user.save();
  const tokens = await createSession(user, req);
  await require('../models/LoginEvent').create({ user: user._id, day: new Date(new Date().setHours(0, 0, 0, 0)) });
  setRefreshCookie(res, tokens.refreshToken);
  return ok(res, { accessToken: tokens.accessToken, user: publicUser(user), mustChangePassword: user.mustChangePassword });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl || '', mustChangePassword: Boolean(user.mustChangePassword) };
}

async function refresh(req, res) {
  try {
    if (!req.cookies.refreshToken) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
    const tokens = await rotateSession(req.cookies.refreshToken);
    setRefreshCookie(res, tokens.refreshToken);
    return ok(res, { accessToken: tokens.accessToken, user: publicUser(tokens.user) });
  } catch (_error) {
    clearRefreshCookie(res);
    return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      try {
        const claims = require('../services/tokenService').verifyRefresh(token);
        await Session.updateOne({ _id: claims.sid, user: claims.sub, revokedAt: null }, { $set: { revokedAt: new Date() } });
      } catch (_error) { /* A stale cookie still gets cleared. */ }
    }
    clearRefreshCookie(res);
    res.setHeader('Clear-Site-Data', 'cache, storage');
    if (req.user?.role === 'admin') await audit.record(req, 'admin.logout');
    return ok(res, { loggedOut: true });
  } catch (error) { return next(error); }
}

async function forgotPassword(req, res, next) {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      const token = randomToken();
      user.resetTokenHash = hashToken(token);
      user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      const link = `${env.PUBLIC_BASE_URL}/reset.html?token=${encodeURIComponent(token)}`;
      try {
        await sendMail(user.email, 'Reset your Classroom Hub password', `Use this single-use link within 15 minutes: ${link}`);
      } catch (mailError) {
        logger.error({ event: 'password_reset_email_failed', errorName: mailError.name }, 'Password reset email could not be delivered');
      }
    }
    return ok(res, { message: 'If that email exists, we sent a link.' });
  } catch (error) {
    logger.error({ event: 'password_reset_request_failed', errorName: error.name }, 'Password reset request could not be completed');
    return ok(res, { message: 'If that email exists, we sent a link.' });
  }
}

async function resetPassword(req, res, next) {
  try {
    const user = await User.findOne({ resetTokenHash: hashToken(req.body.token), resetTokenExpiresAt: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpiresAt');
    if (!user) return fail(res, 400, 'INVALID_TOKEN', 'That reset link is invalid or expired.');
    user.passwordHash = await hashPassword(req.body.password);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return ok(res, { passwordChanged: true });
  } catch (error) { return next(error); }
}

async function verifyChallenge(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash +twoFactor.secretEncrypted');
    if (!user || !await verifyPassword(req.body.password, user.passwordHash)) return fail(res, 400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    if (req.body.enabled) {
      const generated = speakeasy.generateSecret({ name: `Classroom Hub (${user.email})` });
      user.twoFactor.secretEncrypted = encryptSecret(generated.base32, env.DATA_ENCRYPTION_KEY);
      user.twoFactor.enabled = false;
      await user.save();
      return ok(res, { secret: generated.base32, otpauthUrl: generated.otpauth_url });
    }
    user.twoFactor.enabled = false;
    user.twoFactor.secretEncrypted = '';
    user.twoFactor.lastUsedStep = 0;
    await user.save();
    return ok(res, { enabled: false });
  } catch (error) { return next(error); }
}

async function enableTwoFactor(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+twoFactor.secretEncrypted');
    const secret = require('../utils/crypto').decryptSecret(user.twoFactor.secretEncrypted, env.DATA_ENCRYPTION_KEY);
    const verification = speakeasy.totp.verifyDelta({ secret, encoding: 'base32', token: req.body.code, window: 1 });
    if (verification === undefined || verification === null) return fail(res, 400, 'INVALID_CODE', 'The code was not accepted.');
    const step = Math.floor(Date.now() / 30000) + verification.delta;
    const result = await User.updateOne({ _id: user._id, 'twoFactor.lastUsedStep': { $lt: step } }, { $set: { 'twoFactor.enabled': true, 'twoFactor.lastUsedStep': step } });
    if (!result.modifiedCount) return fail(res, 400, 'INVALID_CODE', 'The code was not accepted.');
    return ok(res, { enabled: true });
  } catch (error) { return next(error); }
}

module.exports = { register, verifyEmail, login, verifyTwoFactor, refresh, logout, forgotPassword, resetPassword, verifyChallenge, enableTwoFactor };
