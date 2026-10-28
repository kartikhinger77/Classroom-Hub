const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const uploadRoot = path.resolve(process.env.CLASSROOM_UPLOAD_DIRECTORY || path.join(process.cwd(), 'uploads'));

async function ensureUploadDirectory() {
  await fs.mkdir(uploadRoot, { recursive: true, mode: 0o700 });
}

function safeOriginalName(name) {
  return path.basename(String(name || 'document.pdf')).replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'document.pdf';
}

async function storePdf(tempPath, originalName) {
  const data = await fs.readFile(tempPath);
  if (data.length < 5 || data.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('The uploaded file is not a valid PDF.');
  const pdfText = data.toString('latin1');
  const footer = pdfText.slice(-2048).match(/startxref\s+(\d+)\s+%%EOF\s*$/s);
  if (!footer) {
    const error = new Error('The uploaded PDF appears to be incomplete or corrupted.');
    error.statusCode = 400;
    throw error;
  }
  const xrefOffset = Number(footer[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset >= data.length) {
    const error = new Error('The uploaded PDF appears to be incomplete or corrupted.');
    error.statusCode = 400;
    throw error;
  }
  const xrefTarget = pdfText.slice(xrefOffset, xrefOffset + 300);
  const validXref = /^xref(?:\s|$)/.test(xrefTarget) || /^\d+\s+\d+\s+obj/.test(xrefTarget) && /\/Type\s*\/XRef/.test(xrefTarget);
  if (!validXref) {
    const error = new Error('The uploaded PDF appears to be incomplete or corrupted.');
    error.statusCode = 400;
    throw error;
  }
  await ensureUploadDirectory();
  const fileName = `${crypto.randomUUID()}.pdf`;
  await fs.rename(tempPath, path.join(uploadRoot, fileName));
  return { fileName, originalName: safeOriginalName(originalName), size: data.length };
}

async function removeFile(fileName) {
  if (!fileName || path.basename(fileName) !== fileName || !/^[a-f0-9-]{36}\.(?:pdf|webp)$/i.test(fileName)) return;
  await fs.rm(path.join(uploadRoot, fileName), { force: true });
}

function resolvePrivateFile(fileName) {
  if (!/^[a-f0-9-]{36}\.pdf$/.test(fileName)) return null;
  return path.join(uploadRoot, fileName);
}

async function saveAvatar(buffer) {
  await ensureUploadDirectory();
  const fileName = `${crypto.randomUUID()}.webp`;
  const filePath = path.join(uploadRoot, fileName);
  try {
    await sharp(buffer, { limitInputPixels: 20000000 }).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toFile(filePath);
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
  return `/api/account/avatar/${fileName}`;
}

module.exports = { uploadRoot, ensureUploadDirectory, storePdf, removeFile, resolvePrivateFile, safeOriginalName, saveAvatar };
