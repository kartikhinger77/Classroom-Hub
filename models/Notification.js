const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  subject: { type: String, required: true, maxlength: 80 },
  readAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
