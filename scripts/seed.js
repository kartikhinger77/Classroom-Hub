const env = require('../config/env');
const { connectDatabase, mongoose } = require('../config/db');
const User = require('../models/User');
const models = [
  User,
  require('../models/Post'), require('../models/Session'), require('../models/AuditLog'),
  require('../models/LoginAttempt'), require('../models/LoginEvent'), require('../models/Subject'),
  require('../models/Notification'), require('../models/Setting'), require('../models/Bookmark')
];
const { hashPassword } = require('../services/passwordService');
const logger = require('../utils/logger');

async function seed() {
  await connectDatabase(env.MONGODB_URI);
  await Promise.all(models.map((model) => model.createIndexes()));
  const existingAdmin = await User.exists({ role: 'admin' });
  if (existingAdmin) {
    process.stdout.write('An admin account already exists; no changes made.\n');
    return;
  }
  if (!env.ADMIN_SEED_PASSWORD) throw new Error('Set ADMIN_SEED_PASSWORD in the private environment before creating the first admin.');
  const email = env.ADMIN_SEED_EMAIL.trim().toLowerCase();
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error('The configured seed email belongs to a non-admin account. Choose a different ADMIN_SEED_EMAIL.');
  await User.create({
    name: env.ADMIN_SEED_NAME,
    email,
    role: 'admin',
    passwordHash: await hashPassword(env.ADMIN_SEED_PASSWORD),
    emailVerifiedAt: new Date(),
    mustChangePassword: true
  });
  process.stdout.write('Seed admin created. Change its password immediately after first sign-in.\n');
}

seed().catch((error) => {
  logger.error({ event: 'seed_failed', errorName: error.name }, 'Admin seed failed');
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });
