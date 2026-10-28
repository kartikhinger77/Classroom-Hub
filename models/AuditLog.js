const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorLabel: { type: String, default: '', maxlength: 120 },
  action: { type: String, required: true, maxlength: 100, index: true },
  targetType: { type: String, default: '', maxlength: 80 },
  targetId: { type: String, default: '', maxlength: 80 },
  ip: { type: String, default: '', maxlength: 64 },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true, index: true }
}, { versionKey: false, strict: true });

// Audit entries are append-only. Block both document and query mutation APIs.
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne']) {
  auditLogSchema.pre(operation, function blockAuditMutation() {
    throw new Error('Audit entries are append-only.');
  });
}
auditLogSchema.pre('save', function blockAuditResave(next) {
  if (!this.isNew) return next(new Error('Audit entries are append-only.'));
  return next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
