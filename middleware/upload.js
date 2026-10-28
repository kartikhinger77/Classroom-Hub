const multer = require('multer');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { maxPdfBytes } = require('../config/constants');

const storage = multer.diskStorage({
  destination(_req, _file, callback) { callback(null, os.tmpdir()); },
  filename(_req, _file, callback) { callback(null, `classroom-${crypto.randomUUID()}.tmp`); }
});
const pdfUpload = multer({
  storage,
  limits: { fileSize: maxPdfBytes, files: 1, fields: 10 },
  fileFilter(_req, file, callback) {
    if (file.mimetype !== 'application/pdf' || !String(file.originalname).toLowerCase().endsWith('.pdf')) {
      const error = new Error('PDF files only.');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  }
}).single('pdf');

function uploadPdf(req, res, next) {
  pdfUpload(req, res, (error) => {
    if (error) return next(error);
    if (req.file) res.on('finish', () => { try { fs.rmSync(req.file.path, { force: true }); } catch (_error) { /* Temporary cleanup is best effort. */ } });
    if (req.file) {
      const fd = fs.openSync(req.file.path, 'r');
      const signature = Buffer.alloc(5);
      try { fs.readSync(fd, signature, 0, 5, 0); } finally { fs.closeSync(fd); }
      if (signature.toString('ascii') !== '%PDF-') {
        fs.rmSync(req.file.path, { force: true });
        const invalidPdf = new Error('The uploaded file is not a valid PDF.');
        invalidPdf.statusCode = 400;
        return next(invalidPdf);
      }
    }
    return next();
  });
}

module.exports = { uploadPdf };
