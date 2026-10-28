const cron = require('node-cron');
const User = require('../models/User');
const Session = require('../models/Session');
const Post = require('../models/Post');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const { removeFile } = require('./fileService');
const logger = require('../utils/logger');
const { anonymizeUserReferences } = require('./privacyService');

async function runRetention() {
  const now = new Date();
  const oldTrash = await Post.find({ deletedAt: { $lt: new Date(now.getTime() - 30 * 86400000) } }).select('_id pdf.fileName versions.pdf.fileName author').lean();
  for (const post of oldTrash) {
    const files = new Set([post.pdf?.fileName, ...(post.versions || []).map((version) => version.pdf?.fileName)].filter(Boolean));
    await Promise.all([...files].map(removeFile));
  }
  const oldUserDeletes = await User.find({ deleteAfter: { $lte: now } }).select('_id avatarUrl').lean();
  for (const user of oldUserDeletes) {
    // The privacy erasure path uses a controlled service; application audit edits remain blocked.
    await anonymizeUserReferences(user._id);
    const avatarName = user.avatarUrl?.match(/\/api\/account\/avatar\/([a-f0-9-]{36}\.webp)$/)?.[1];
    if (avatarName) await removeFile(avatarName);
    const posts = await Post.find({ author: user._id }).select('_id pdf.fileName versions.pdf.fileName').lean();
    for (const post of posts) {
      const files = new Set([post.pdf?.fileName, ...(post.versions || []).map((version) => version.pdf?.fileName)].filter(Boolean));
      await Promise.all([...files].map(removeFile));
    }
    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Session.deleteMany({ user: user._id }),
      Bookmark.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
      User.deleteOne({ _id: user._id })
    ]);
  }
  await Promise.all([
    Post.deleteMany({ deletedAt: { $lt: new Date(now.getTime() - 30 * 86400000) } }),
    Session.deleteMany({ $or: [{ expiresAt: { $lte: now } }, { revokedAt: { $lt: new Date(now.getTime() - 30 * 86400000) } }] }),
    Notification.deleteMany({ expiresAt: { $lte: now } }),
    User.deleteMany({ emailVerifiedAt: null, createdAt: { $lt: new Date(now.getTime() - 7 * 86400000) }, role: { $ne: 'admin' } }),
    User.updateMany({ resetTokenExpiresAt: { $lte: now } }, { $unset: { resetTokenHash: 1, resetTokenExpiresAt: 1 } }),
    User.updateMany({ emailVerificationExpiresAt: { $lte: now } }, { $unset: { emailVerificationHash: 1, emailVerificationExpiresAt: 1 } }),
    User.updateMany({ pendingEmailVerificationExpiresAt: { $lte: now } }, { $unset: { pendingEmail: 1, pendingEmailVerificationHash: 1, pendingEmailVerificationExpiresAt: 1 } })
  ]);
}

function startRetentionScheduler() {
  return cron.schedule('17 3 * * *', () => runRetention().catch((error) => logger.error({ event: 'retention_failed', errorName: error.name }, 'Retention job failed')));
}

module.exports = { runRetention, startRetentionScheduler };
