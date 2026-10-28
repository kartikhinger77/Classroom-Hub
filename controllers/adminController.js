const crypto = require('node:crypto');
const User = require('../models/User');
const Post = require('../models/Post');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const Subject = require('../models/Subject');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const Setting = require('../models/Setting');
const LoginEvent = require('../models/LoginEvent');
const { hashPassword } = require('../services/passwordService');
const { record } = require('../services/auditService');
const { parsePagination } = require('../utils/pagination');
const { ok, fail } = require('../utils/response');
const { removeFile } = require('../services/fileService');
const { anonymizeUserReferences } = require('../services/privacyService');

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function makeTemporaryPassword() {
  return `${crypto.randomBytes(18).toString('hex')}Aa7`;
}
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status, emailVerifiedAt: user.emailVerifiedAt, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
}

async function users(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.q) {
      const safeQ = escapeRegex(String(req.query.q).slice(0, 80));
      filter.$or = [{ name: { $regex: safeQ, $options: 'i' } }, { email: { $regex: safeQ, $options: 'i' } }];
    }
    if (['student', 'teacher', 'admin'].includes(req.query.role)) filter.role = req.query.role;
    if (['active', 'suspended'].includes(req.query.status)) filter.status = req.query.status;
    const sortField = ['name', 'email', 'role', 'status', 'lastLoginAt', 'createdAt'].includes(req.query.sort) ? req.query.sort : 'createdAt';
    const direction = req.query.direction === 'asc' ? 1 : -1;
    const [rows, total] = await Promise.all([
      User.find(filter).select('_id name email role status emailVerifiedAt lastLoginAt createdAt').sort({ [sortField]: direction }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    await record(req, 'admin.users.list', 'User', '', { page, limit, returned: rows.length });
    return ok(res, { items: rows, page, limit, total });
  } catch (error) { return next(error); }
}

async function createUser(req, res, next) {
  try {
    const temporaryPassword = req.body.password || makeTemporaryPassword();
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      role: req.body.role,
      passwordHash: await hashPassword(temporaryPassword),
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
      createdBy: req.user._id
    });
    await record(req, 'admin.user.create', 'User', user._id, { role: user.role });
    return ok(res, { user: publicUser(user), temporaryPassword }, 201);
  } catch (error) { return next(error); }
}

async function setStatus(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found.');
    if (user.role === 'admin' && req.body.status === 'suspended') {
      const activeAdmins = await User.countDocuments({ role: 'admin', status: 'active' });
      if (user.status === 'active' && activeAdmins <= 1) return fail(res, 409, 'LAST_ADMIN', 'The last active admin cannot be suspended.');
    }
    user.status = req.body.status;
    await user.save();
    if (user.status === 'suspended') await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await record(req, 'admin.user.status', 'User', user._id, { status: user.status });
    return ok(res, { user: publicUser(user) });
  } catch (error) { return next(error); }
}

async function resetPassword(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found.');
    const temporaryPassword = makeTemporaryPassword();
    user.passwordHash = await hashPassword(temporaryPassword);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = true;
    await user.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await record(req, 'admin.user.reset_password', 'User', user._id);
    return ok(res, { temporaryPassword, mustChangePassword: true });
  } catch (error) { return next(error); }
}

async function verifyUserEmail(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      $set: { emailVerifiedAt: new Date() },
      $unset: { emailVerificationHash: 1, emailVerificationExpiresAt: 1 }
    }, { new: true }).select('_id name email role status emailVerifiedAt lastLoginAt createdAt').lean();
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found.');
    await record(req, 'admin.user.verify_email', 'User', user._id);
    return ok(res, { user: publicUser(user), verified: true });
  } catch (error) { return next(error); }
}

async function removeUser(req, res, next) {
  try {
    if (String(req.params.id) === String(req.user._id)) return fail(res, 409, 'SELF_DELETE_BLOCKED', 'You cannot remove your own account.');
    const user = await User.findById(req.params.id).select('name email role avatarUrl');
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found.');
    if (user.role === 'admin' && await User.countDocuments({ role: 'admin' }) <= 1) return fail(res, 409, 'LAST_ADMIN', 'The last admin cannot be removed.');
    const posts = await Post.find({ author: user._id }).select('_id pdf.fileName versions.pdf.fileName').lean();
    await record(req, 'admin.user.remove', 'User', user._id, { postCount: posts.length });
    await anonymizeUserReferences(user._id);
    for (const post of posts) {
      const files = new Set([post.pdf?.fileName, ...(post.versions || []).map((version) => version.pdf?.fileName)].filter(Boolean));
      await Promise.all([...files].map(removeFile));
    }
    const avatarName = user.avatarUrl?.match(/\/api\/account\/avatar\/([a-f0-9-]{36}\.webp)$/)?.[1];
    if (avatarName) await removeFile(avatarName);
    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Session.deleteMany({ user: user._id }),
      Bookmark.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
      User.deleteOne({ _id: user._id })
    ]);
    return ok(res, { removed: true });
  } catch (error) { return next(error); }
}

function csvCell(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
}

async function exportUsers(req, res, next) {
  try {
    const users = await User.find({}).select('name email role status lastLoginAt createdAt').sort({ createdAt: -1 }).limit(10000).lean();
    await record(req, 'admin.users.export', 'User', '', { count: users.length });
    const header = ['name', 'email', 'role', 'status', 'lastLoginAt', 'createdAt'].join(',');
    const lines = users.map((user) => [user.name, user.email, user.role, user.status, user.lastLoginAt?.toISOString() || '', user.createdAt.toISOString()].map(csvCell).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="classroom-hub-users.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send([header, ...lines].join('\r\n'));
  } catch (error) { return next(error); }
}

async function auditList(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      AuditLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments({})
    ]);
    await record(req, 'admin.audit.view', 'AuditLog', '', { page, returned: items.length });
    return ok(res, { items, page, limit, total });
  } catch (error) { return next(error); }
}

async function subjects(req, res) {
  const items = await Subject.find({}).select('name active createdAt updatedAt').sort({ name: 1 }).lean();
  await record(req, 'admin.subjects.list', 'Subject', '', { count: items.length });
  return ok(res, items);
}

async function createSubject(req, res, next) {
  try {
    const subject = await Subject.create({ name: req.body.name, createdBy: req.user._id });
    await record(req, 'admin.subject.create', 'Subject', subject._id);
    return ok(res, subject, 201);
  } catch (error) { return next(error); }
}

async function updateSubject(req, res, next) {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, { $set: { name: req.body.name, active: req.body.active } }, { new: true, runValidators: true }).select('name active createdAt updatedAt');
    if (!subject) return fail(res, 404, 'NOT_FOUND', 'Subject not found.');
    await record(req, 'admin.subject.update', 'Subject', subject._id);
    return ok(res, subject);
  } catch (error) { return next(error); }
}

async function publicSettings(_req, res) {
  const [signup, announcement] = await Promise.all([
    Setting.findOne({ key: 'studentSignupEnabled' }).lean(), Setting.findOne({ key: 'announcement' }).lean()
  ]);
  const banner = announcement?.value || {};
  const now = new Date();
  const visible = banner.message && new Date(banner.startsAt) <= now && new Date(banner.endsAt) >= now;
  return ok(res, { studentSignupEnabled: signup?.value !== false, announcement: visible ? banner : null });
}

async function saveSetting(req, res, next) {
  try {
    if (req.params.key === 'studentSignupEnabled' && typeof req.body.value !== 'boolean') return fail(res, 400, 'INVALID_INPUT', 'The setting value must be true or false.');
    if (req.params.key === 'announcement') {
      const value = req.body.value;
      if (!value || typeof value.message !== 'string' || value.message.length > 240 || !Number.isFinite(Date.parse(value.startsAt)) || !Number.isFinite(Date.parse(value.endsAt)) || Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
        return fail(res, 400, 'INVALID_INPUT', 'Provide a short announcement with a valid start and end time.');
      }
    }
    const setting = await Setting.findOneAndUpdate({ key: req.params.key }, { $set: { value: req.body.value, updatedBy: req.user._id } }, { upsert: true, new: true, runValidators: true });
    await record(req, 'admin.setting.update', 'Setting', setting._id, { key: setting.key });
    return ok(res, { key: setting.key, value: setting.value });
  } catch (error) { return next(error); }
}

async function dashboard(req, res, next) {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const [usersByRole, postsPerWeek, loginsPerDay, downloads] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }, { $project: { _id: 0, role: '$_id', count: 1 } }]),
      Post.aggregate([{ $match: { createdAt: { $gte: since }, deletedAt: null } }, { $group: { _id: { $dateToString: { format: '%Y-%U', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      LoginEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Post.find({ deletedAt: null }).select('_id title downloadCount').sort({ downloadCount: -1 }).limit(10).lean()
    ]);
    await record(req, 'admin.dashboard.view', 'Dashboard');
    return ok(res, { usersByRole, postsPerWeek, loginsPerDay, mostDownloaded: downloads });
  } catch (error) { return next(error); }
}

async function trash(req, res) {
  const items = await Post.find({ deletedAt: { $ne: null } }).select('_id title type subject author deletedAt').populate({ path: 'author', select: 'name' }).sort({ deletedAt: -1 }).limit(50).lean();
  await record(req, 'admin.trash.view', 'Post', '', { count: items.length });
  return ok(res, items);
}

module.exports = { users, createUser, setStatus, resetPassword, verifyUserEmail, removeUser, exportUsers, auditList, subjects, createSubject, updateSubject, publicSettings, saveSetting, dashboard, trash };
