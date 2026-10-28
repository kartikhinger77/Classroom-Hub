const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const env = require('../config/env');
const { connectDatabase, mongoose } = require('../config/db');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword } = require('../services/passwordService');
const AuditLog = require('../models/AuditLog');

async function recover() {
  if (process.env.RECOVERY_CONFIRM !== 'YES') throw new Error('Set RECOVERY_CONFIRM=YES after verifying the server and target admin.');
  const email = String(process.env.RECOVERY_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Set RECOVERY_ADMIN_EMAIL to the exact administrator email.');
  await connectDatabase(env.MONGODB_URI);
  const admin = await User.findOne({ email, role: 'admin' });
  if (!admin) throw new Error('No admin account matched the configured recovery email.');
  const temporaryPassword = `${crypto.randomBytes(18).toString('hex')}Aa7`;
  admin.passwordHash = await hashPassword(temporaryPassword);
  admin.mustChangePassword = true;
  admin.passwordChangedAt = new Date();
  await admin.save();
  await Session.updateMany({ user: admin._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await AuditLog.create({ actor: null, actorLabel: 'Server recovery', action: 'system.admin_password_recovery', targetType: 'User', targetId: String(admin._id), ip: 'server' });
  const passwordFile = path.join(os.tmpdir(), `classroom-admin-recovery-${crypto.randomUUID()}.txt`);
  await fs.writeFile(passwordFile, `${temporaryPassword}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  process.stdout.write(`Temporary password was written to a restricted server-only file: ${passwordFile}\nRead it through the server shell, deliver it privately, then delete the file.\n`);
}

recover().catch((error) => {
  process.stderr.write(`Admin recovery failed: ${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });
