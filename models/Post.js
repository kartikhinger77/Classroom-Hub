const mongoose = require('mongoose');
const { postTypes } = require('../config/constants');

const versionSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 180 },
  subject: { type: String, required: true, maxlength: 80 },
  contentHtml: { type: String, default: '', maxlength: 200000 },
  pdf: {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '', maxlength: 180 },
    size: { type: Number, default: 0 }
  },
  editedAt: { type: Date, default: Date.now },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: true });

const postSchema = new mongoose.Schema({
  type: { type: String, enum: postTypes, required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 180 },
  subject: { type: String, required: true, trim: true, minlength: 1, maxlength: 80, index: true },
  contentHtml: { type: String, default: '', maxlength: 200000 },
  pdf: {
    fileName: { type: String, default: '' },
    originalName: { type: String, default: '', maxlength: 180 },
    size: { type: Number, default: 0 }
  },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  versions: { type: [versionSchema], default: [] },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  downloadCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });

postSchema.index({ title: 'text', subject: 'text' });
postSchema.index({ type: 1, subject: 1, createdAt: -1 });
postSchema.pre('validate', function ensurePostHasContent(next) {
  if (!this.contentHtml && !this.pdf?.fileName) return next(new Error('A post needs written content or a PDF.'));
  return next();
});

module.exports = mongoose.model('Post', postSchema);
