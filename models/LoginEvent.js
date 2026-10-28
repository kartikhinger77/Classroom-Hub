const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  day: { type: Date, required: true, index: true }
}, { timestamps: true, versionKey: false });
loginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = mongoose.model('LoginEvent', loginEventSchema);
