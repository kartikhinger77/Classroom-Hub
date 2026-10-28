const fs = require('node:fs');
const User = require('../models/User');
const Session = require('../models/Session');
const Post = require('../models/Post');
const Bookmark = require('../models/Bookmark');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { randomToken, hashToken } = require('../utils/crypto');
const { sendMail } = require('../services/mailService');
const { saveAvatar, uploadRoot } = require('../services/fileService');
const env = require('../config/env');
const { ok, fail } = require('../utils/response');
const { removeFile } = require('../services/fileService');
const LoginEvent = require('../models/LoginEvent');

async function me(req, res) {
  const user = await User.findById(req.user._id).select('_id name email role status bio avatarUrl mustChangePassword lastLoginAt createdAt twoFactor.enabled deleteAfter').lean();
  return ok(res, user);
}

async function updateMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (req.body.name !== undefined) user.name = req.body.name;
    if (req.body.bio !== undefined) user.bio = req.body.bio;
    if (req.body.avatarUrl !== undefined) user.avatarUrl = req.body.avatarUrl;
    if (req.body.email !== undefined && req.body.email !== user.email) {
      if (!req.body.email.endsWith('@gmail.com')) return fail(res, 400, 'INVALID_INPUT', 'Use a Gmail address.');
      if (await User.exists({ email: req.body.email })) return fail(res, 409, 'EMAIL_IN_USE', 'That email is already in use.');
      const token = randomToken();
      user.pendingEmail = req.body.email;
      user.pendingEmailVerificationHash = hashToken(token);
      user.pendingEmailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await sendMail(req.body.email, 'Verify your new Classroom Hub email', `Confirm this change: ${env.PUBLIC_BASE_URL}/verify.html?token=${encodeURIComponent(token)}`);
    }
    await user.save();
    return ok(res, { profile: { name: user.name, bio: user.bio, avatarUrl: user.avatarUrl }, emailVerificationSent: Boolean(user.pendingEmail) });
  } catch (error) { return next(error); }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return fail(res, 400, 'INVALID_INPUT', 'Choose an image file.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return fail(res, 400, 'INVALID_INPUT', 'Use a JPEG, PNG, or WebP image.');
    const existing = await User.findById(req.user._id).select('avatarUrl').lean();
    const avatarUrl = await saveAvatar(req.file.buffer);
    await User.updateOne({ _id: req.user._id }, { $set: { avatarUrl } });
    const oldName = existing?.avatarUrl?.match(/\/api\/account\/avatar\/([a-f0-9-]{36}\.webp)$/)?.[1];
    if (oldName) await removeFile(oldName);
    return ok(res, { avatarUrl });
  } catch (error) { return next(error); }
}

async function readAvatar(req, res) {
  const avatarFile = /^[a-f0-9-]{36}\.webp$/.test(req.params.file) ? require('node:path').join(uploadRoot, req.params.file) : null;
  if (!avatarFile) return fail(res, 404, 'NOT_FOUND', 'The image was not found.');
  const user = await User.findById(req.user._id).select('avatarUrl').lean();
  if (req.user.role !== 'admin' && !user?.avatarUrl?.endsWith(req.params.file)) return fail(res, 404, 'NOT_FOUND', 'The image was not found.');
  if (!fs.existsSync(avatarFile)) return fail(res, 404, 'NOT_FOUND', 'The image was not found.');
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return fs.createReadStream(avatarFile).pipe(res);
}

async function changePassword(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!await verifyPassword(req.body.currentPassword, user.passwordHash)) return fail(res, 400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    user.passwordHash = await hashPassword(req.body.password);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    await Session.updateMany({ user: user._id, _id: { $ne: req.sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return ok(res, { passwordChanged: true, otherSessionsRevoked: true });
  } catch (error) { return next(error); }
}

async function sessions(req, res) {
  const data = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('_id userAgent ip createdAt expiresAt').sort({ createdAt: -1 }).lean();
  return ok(res, data.map((session) => ({ ...session, current: String(session._id) === String(req.sessionId) })));
}

async function revokeSession(req, res) {
  const result = await Session.updateOne({ _id: req.params.id, user: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!result.modifiedCount) return fail(res, 404, 'NOT_FOUND', 'Session not found.');
  return ok(res, { revoked: true });
}

async function logoutAll(req, res, next) {
  try {
    await Session.updateMany({ user: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.clearCookie('refreshToken', { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth' });
    res.setHeader('Clear-Site-Data', 'cache, storage');
    return ok(res, { loggedOut: true });
  } catch (error) { return next(error); }
}

async function exportData(req, res) {
  const [user, authoredPosts, savedPosts, loginEvents] = await Promise.all([
    User.findById(req.user._id).select('name email role bio createdAt lastLoginAt').lean(),
    Post.find({ author: req.user._id }).select('_id type title subject createdAt updatedAt').lean(),
    Bookmark.find({ user: req.user._id }).populate({ path: 'post', select: '_id type title subject createdAt' }).lean(),
    LoginEvent.find({ user: req.user._id }).select('day createdAt').sort({ createdAt: -1 }).limit(1000).lean()
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="my-classroom-hub-data.json"');
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { profile: user, authoredPosts, savedPosts: savedPosts.map((item) => item.post).filter(Boolean), loginEvents, exportedAt: new Date().toISOString() });
}

async function requestDeletion(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (user.role === 'admin') return fail(res, 409, 'ADMIN_DELETION_BLOCKED', 'Admins must ask another admin to manage their account.');
    if (!await verifyPassword(req.body.password, user.passwordHash)) return fail(res, 400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    user.deleteRequestedAt = new Date();
    user.deleteAfter = new Date(Date.now() + 7 * 86400000);
    await user.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return ok(res, { deletionScheduledAt: user.deleteAfter });
  } catch (error) { return next(error); }
}

async function cancelDeletion(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash deleteAfter');
    if (!user.deleteAfter) return fail(res, 409, 'NO_DELETION_PENDING', 'There is no pending account deletion.');
    if (!await verifyPassword(req.body.password, user.passwordHash)) return fail(res, 400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    user.deleteAfter = null;
    user.deleteRequestedAt = null;
    await user.save();
    return ok(res, { deletionCancelled: true });
  } catch (error) { return next(error); }
}

async function verifyPendingEmail(req, res, next) {
  try {
    const user = await User.findOne({ pendingEmailVerificationHash: hashToken(req.body.token), pendingEmailVerificationExpiresAt: { $gt: new Date() } })
      .select('+pendingEmail +pendingEmailVerificationHash +pendingEmailVerificationExpiresAt');
    if (!user) return fail(res, 400, 'INVALID_TOKEN', 'That verification link is invalid or expired.');
    user.email = user.pendingEmail;
    user.emailVerifiedAt = new Date();
    user.pendingEmail = undefined;
    user.pendingEmailVerificationHash = undefined;
    user.pendingEmailVerificationExpiresAt = undefined;
    await user.save();
    return ok(res, { emailVerified: true });
  } catch (error) { return next(error); }
}

module.exports = { me, updateMe, uploadAvatar, readAvatar, changePassword, sessions, revokeSession, logoutAll, exportData, requestDeletion, cancelDeletion, verifyPendingEmail };
