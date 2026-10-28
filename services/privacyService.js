const User = require('../models/User');
const Post = require('../models/Post');
const Subject = require('../models/Subject');
const Setting = require('../models/Setting');
const AuditLog = require('../models/AuditLog');
const LoginEvent = require('../models/LoginEvent');

async function anonymizeUserReferences(userId) {
  const id = String(userId);
  await Promise.all([
    AuditLog.collection.updateMany({ actor: userId }, { $set: { actor: null, actorLabel: 'Deleted user', ip: 'anonymized' } }),
    AuditLog.collection.updateMany({ targetType: 'User', targetId: id }, { $set: { targetId: 'anonymized' } }),
    User.collection.updateMany({ createdBy: userId }, { $set: { createdBy: null } }),
    Post.collection.updateMany({ deletedBy: userId }, { $set: { deletedBy: null } }),
    Post.collection.updateMany({ 'versions.editedBy': userId }, [{ $set: { versions: { $map: { input: '$versions', as: 'version', in: { $cond: [{ $eq: ['$$version.editedBy', userId] }, { $mergeObjects: ['$$version', { editedBy: null }] }, '$$version'] } } } } }]),
    Subject.collection.updateMany({ createdBy: userId }, { $set: { createdBy: null } }),
    Setting.collection.updateMany({ updatedBy: userId }, { $set: { updatedBy: null } }),
    LoginEvent.deleteMany({ user: userId })
  ]);
}

module.exports = { anonymizeUserReferences };
