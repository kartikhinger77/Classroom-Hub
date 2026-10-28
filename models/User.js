const mongoose = require('mongoose');
const { roles } = require('../config/constants');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true, default: 'student', index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  bio: { type: String, default: '', maxlength: 500 },
  avatarUrl: { type: String, default: '', maxlength: 500 },
  failedLoginCount: { type: Number, default: 0, min: 0 },
  lockUntil: { type: Date, default: null },
  mustChangePassword: { type: Boolean, default: false },
  passwordChangedAt: { type: Date, default: Date.now },
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secretEncrypted: { type: String, default: '', select: false },
    lastUsedStep: { type: Number, default: 0, min: 0 }
  },
  emailVerifiedAt: { type: Date, default: null },
  pendingEmail: { type: String, lowercase: true, trim: true, select: false },
  pendingEmailVerificationHash: { type: String, select: false },
  pendingEmailVerificationExpiresAt: { type: Date, select: false },
  emailVerificationHash: { type: String, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  resetTokenHash: { type: String, select: false },
  resetTokenExpiresAt: { type: Date, select: false },
  lastLoginAt: { type: Date, default: null },
  subjectsOpened: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deleteRequestedAt: { type: Date, default: null },
  deleteAfter: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

userSchema.index({ deleteAfter: 1 }, { sparse: true });
userSchema.set('toJSON', { transform(_doc, value) { delete value.passwordHash; delete value.twoFactor?.secretEncrypted; delete value.emailVerificationHash; delete value.resetTokenHash; return value; } });

module.exports = mongoose.model('User', userSchema);
