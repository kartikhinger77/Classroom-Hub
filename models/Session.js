const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshTokenHash: { type: String, required: true, select: false },
  userAgent: { type: String, default: 'unknown', maxlength: 300 },
  ip: { type: String, default: '', maxlength: 64 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true }
}, { timestamps: true, versionKey: false });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('Session', sessionSchema);
