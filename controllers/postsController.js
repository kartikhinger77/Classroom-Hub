const fs = require('node:fs');
const sanitizeHtml = require('sanitize-html');
const Post = require('../models/Post');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const { parsePagination } = require('../utils/pagination');
const { storePdf, removeFile, resolvePrivateFile, safeOriginalName } = require('../services/fileService');
const { record } = require('../services/auditService');
const { ok, fail } = require('../utils/response');

const richTextPolicy = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'a', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard'
};
function sanitizeContent(value) { return sanitizeHtml(String(value || ''), richTextPolicy).slice(0, 200000); }
function safePost(post) {
  const value = { ...post };
  delete value.versions;
  if (value.pdf) {
    value.pdf = { originalName: value.pdf.originalName, size: value.pdf.size, available: Boolean(value.pdf.fileName) };
  }
  return value;
}

function postVersionSnapshot(post, editorId) {
  return {
    title: post.title,
    subject: post.subject,
    contentHtml: post.contentHtml,
    pdf: post.pdf ? { fileName: post.pdf.fileName || '', originalName: post.pdf.originalName || '', size: post.pdf.size || 0 } : {},
    editedAt: post.updatedAt || post.createdAt,
    editedBy: editorId
  };
}

async function removeUnreferencedVersionFiles(post, discardedVersions) {
  const retained = new Set([post.pdf?.fileName, ...post.versions.map((version) => version.pdf?.fileName)].filter(Boolean));
  const discarded = new Set(discardedVersions.map((version) => version.pdf?.fileName).filter(Boolean));
  await Promise.all([...discarded].filter((fileName) => !retained.has(fileName)).map(removeFile));
}

async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { deletedAt: null };
    if (req.query.type === 'note' || req.query.type === 'exercise') filter.type = req.query.type;
    if (req.query.subject) {
      filter.subject = String(req.query.subject).slice(0, 80);
      await User.updateOne({ _id: req.user._id }, { $addToSet: { subjectsOpened: filter.subject } });
    }
    if (req.query.q?.trim()) filter.$text = { $search: req.query.q.trim().slice(0, 80) };
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from && Number.isFinite(Date.parse(req.query.from))) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to && Number.isFinite(Date.parse(req.query.to))) filter.createdAt.$lte = new Date(req.query.to);
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }
    if (req.query.saved === 'true') {
      const bookmarks = await Bookmark.find({ user: req.user._id }).select('post').lean();
      filter._id = { $in: bookmarks.map((item) => item.post) };
    }
    const [items, total] = await Promise.all([
      Post.find(filter).select('-versions').populate({ path: 'author', select: 'name role' }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter)
    ]);
    return ok(res, { items: items.map(safePost), page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { return next(error); }
}

async function get(req, res) {
  const post = await Post.findOne({ _id: req.params.id, deletedAt: null }).populate({ path: 'author', select: 'name role' }).lean();
  if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
  return ok(res, safePost(post));
}

async function create(req, res, next) {
  let storedFile;
  try {
    const { type, title, subject } = req.body;
    if (!['note', 'exercise'].includes(type) || typeof title !== 'string' || title.trim().length < 1 || title.length > 180 || typeof subject !== 'string' || subject.trim().length < 1 || subject.trim().length > 80 || (req.body.contentHtml !== undefined && typeof req.body.contentHtml !== 'string')) {
      return fail(res, 400, 'INVALID_INPUT', 'Add a title, subject, and valid type.');
    }
    const knownSubject = await Subject.exists({ name: subject.trim(), active: true });
    if (!knownSubject) return fail(res, 400, 'INVALID_SUBJECT', 'Choose an active subject.');
    const contentHtml = sanitizeContent(req.body.contentHtml);
    if (req.file) storedFile = await storePdf(req.file.path, req.file.originalname);
    if (!contentHtml && !storedFile) return fail(res, 400, 'MISSING_CONTENT', 'Write content or upload a PDF.');
    const post = await Post.create({ type, title: title.trim(), subject: subject.trim(), contentHtml, pdf: storedFile || {}, author: req.user._id });
    const recipients = await User.find({ _id: { $ne: req.user._id }, subjectsOpened: post.subject, status: 'active' }).select('_id').lean();
    if (recipients.length) await Notification.insertMany(recipients.map((user) => ({ user: user._id, post: post._id, subject: post.subject, expiresAt: new Date(Date.now() + 30 * 86400000) })));
    if (req.user.role === 'admin') await record(req, 'admin.post.create', 'Post', post._id);
    return ok(res, safePost(post.toObject()), 201);
  } catch (error) {
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    if (storedFile?.fileName) await removeFile(storedFile.fileName);
    return next(error);
  }
}

async function update(req, res, next) {
  let newFile;
  let discardedVersions = [];
  try {
    const post = await Post.findOne({ _id: req.params.id, deletedAt: null });
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
    if (String(post.author) !== String(req.user._id) && req.user.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'You can only edit your own posts.');
    if (req.body.title !== undefined && (typeof req.body.title !== 'string' || req.body.title.trim().length < 1 || req.body.title.trim().length > 180)) return fail(res, 400, 'INVALID_INPUT', 'The title is invalid.');
    if (req.body.subject !== undefined && (typeof req.body.subject !== 'string' || req.body.subject.trim().length < 1 || req.body.subject.trim().length > 80)) return fail(res, 400, 'INVALID_INPUT', 'The subject is invalid.');
    if (req.body.contentHtml !== undefined && (typeof req.body.contentHtml !== 'string' || req.body.contentHtml.length > 200000)) return fail(res, 400, 'INVALID_INPUT', 'The written content is invalid.');
    if (req.body.subject && !await Subject.exists({ name: req.body.subject.trim(), active: true })) return fail(res, 400, 'INVALID_SUBJECT', 'Choose an active subject.');
    post.versions.unshift(postVersionSnapshot(post, req.user._id));
    discardedVersions = post.versions.slice(10);
    post.versions = post.versions.slice(0, 10);
    if (req.body.title !== undefined) post.title = req.body.title.trim();
    if (req.body.subject !== undefined) post.subject = req.body.subject.trim();
    if (req.body.contentHtml !== undefined) post.contentHtml = sanitizeContent(req.body.contentHtml);
    if (req.file) {
      newFile = await storePdf(req.file.path, req.file.originalname);
      post.pdf = newFile;
    }
    if (!post.contentHtml && !post.pdf?.fileName) return fail(res, 400, 'MISSING_CONTENT', 'Write content or upload a PDF.');
    await post.save();
    await removeUnreferencedVersionFiles(post, discardedVersions);
    if (req.user.role === 'admin') await record(req, 'admin.post.update', 'Post', post._id);
    return ok(res, safePost(post.toObject()));
  } catch (error) {
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    if (newFile?.fileName) await removeFile(newFile.fileName);
    return next(error);
  }
}

async function trash(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, deletedAt: null });
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
    if (String(post.author) !== String(req.user._id) && req.user.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'You can only delete your own posts.');
    post.deletedAt = new Date();
    post.deletedBy = req.user._id;
    await post.save();
    if (req.user.role === 'admin') await record(req, 'admin.post.trash', 'Post', post._id);
    return ok(res, { movedToTrash: true, purgeAfter: new Date(Date.now() + 30 * 86400000) });
  } catch (error) { return next(error); }
}

async function file(req, res) {
  const post = await Post.findOne({ _id: req.params.id, deletedAt: null }).select('pdf').lean();
  if (!post?.pdf?.fileName) return fail(res, 404, 'NOT_FOUND', 'PDF not found.');
  const filePath = resolvePrivateFile(post.pdf.fileName);
  if (!filePath || !fs.existsSync(filePath)) return fail(res, 404, 'NOT_FOUND', 'PDF not found.');
  const name = encodeURIComponent(safeOriginalName(post.pdf.originalName)).replace(/['()]/g, encodeURIComponent);
  const inline = req.query.download !== '1';
  if (!inline) await Post.updateOne({ _id: req.params.id }, { $inc: { downloadCount: 1 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="document.pdf"; filename*=UTF-8''${name}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return fs.createReadStream(filePath).pipe(res);
}

async function history(req, res) {
  const post = await Post.findOne({ _id: req.params.id, deletedAt: null }).select('author versions').lean();
  if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
  if (String(post.author) !== String(req.user._id) && req.user.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'You cannot view this history.');
  return ok(res, post.versions.map((version) => ({
    ...version,
    pdf: { originalName: version.pdf?.originalName || '', size: version.pdf?.size || 0, available: Boolean(version.pdf?.fileName) }
  })));
}

async function restoreVersion(req, res) {
  const post = await Post.findOne({ _id: req.params.id, deletedAt: null });
  if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
  if (String(post.author) !== String(req.user._id) && req.user.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'You cannot restore this version.');
  const version = post.versions.id(req.params.versionId);
  if (!version) return fail(res, 404, 'NOT_FOUND', 'Version not found.');
  const restored = { title: version.title, subject: version.subject, contentHtml: version.contentHtml, pdf: version.pdf?.toObject?.() || version.pdf || {} };
  if (restored.pdf.fileName && (!resolvePrivateFile(restored.pdf.fileName) || !fs.existsSync(resolvePrivateFile(restored.pdf.fileName)))) return fail(res, 409, 'VERSION_FILE_MISSING', 'The PDF file for this version is no longer available.');
  post.versions.unshift(postVersionSnapshot(post, req.user._id));
  const discardedVersions = post.versions.slice(10);
  post.versions = post.versions.slice(0, 10);
  post.title = restored.title;
  post.subject = restored.subject;
  post.contentHtml = restored.contentHtml;
  post.pdf = restored.pdf;
  await post.save();
  await removeUnreferencedVersionFiles(post, discardedVersions);
  if (req.user.role === 'admin') await record(req, 'admin.post.restore_version', 'Post', post._id);
  return ok(res, safePost(post.toObject()));
}

async function trashList(req, res) {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    Post.find({ deletedAt: { $ne: null } }).select('-versions').populate({ path: 'author', select: 'name role' }).sort({ deletedAt: -1 }).skip(skip).limit(limit).lean(),
    Post.countDocuments({ deletedAt: { $ne: null } })
  ]);
  return ok(res, { items, page, limit, total });
}

async function restore(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Trashed post not found.');
    post.deletedAt = null;
    post.deletedBy = null;
    await post.save();
    await record(req, 'admin.post.restore', 'Post', post._id);
    return ok(res, { restored: true });
  } catch (error) { return next(error); }
}

async function permanentlyDelete(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Trashed post not found.');
    const files = new Set([post.pdf?.fileName, ...post.versions.map((version) => version.pdf?.fileName)].filter(Boolean));
    await Promise.all([...files].map(removeFile));
    await Post.deleteOne({ _id: post._id });
    await Bookmark.deleteMany({ post: post._id });
    await Notification.deleteMany({ post: post._id });
    await record(req, 'admin.post.permanent_delete', 'Post', post._id);
    return ok(res, { deleted: true });
  } catch (error) { return next(error); }
}

async function bookmark(req, res) {
  const post = await Post.exists({ _id: req.params.id, deletedAt: null });
  if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found.');
  await Bookmark.updateOne({ user: req.user._id, post: req.params.id }, { $setOnInsert: { user: req.user._id, post: req.params.id } }, { upsert: true });
  return ok(res, { saved: true });
}

async function unbookmark(req, res) {
  await Bookmark.deleteOne({ user: req.user._id, post: req.params.id });
  return ok(res, { saved: false });
}

async function notifications(req, res) {
  const items = await Notification.find({ user: req.user._id, expiresAt: { $gt: new Date() } }).populate({ path: 'post', select: 'title type' }).sort({ createdAt: -1 }).limit(30).lean();
  return ok(res, items);
}

async function markNotificationRead(req, res) {
  const result = await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } });
  if (!result.matchedCount) return fail(res, 404, 'NOT_FOUND', 'Notification not found.');
  return ok(res, { read: true });
}

module.exports = { list, get, create, update, trash, file, history, restoreVersion, trashList, restore, permanentlyDelete, bookmark, unbookmark, notifications, markNotificationRead, sanitizeContent };
