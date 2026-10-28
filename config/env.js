const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url(),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().length(32),
  ADMIN_SEED_NAME: z.string().min(1).max(100),
  ADMIN_SEED_EMAIL: z.string().email(),
  ADMIN_SEED_PASSWORD: z.string().max(128).default(''),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().min(3),
  PUBLIC_BASE_URL: z.string().url(),
  BACKUP_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  MONGODUMP_PATH: z.string().default('mongodump'),
  MONGORESTORE_PATH: z.string().default('mongorestore'),
  SENTRY_DSN: z.string().optional().default('')
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const missing = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${missing}`);
}

const env = result.data;
if (env.ADMIN_SEED_PASSWORD && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(env.ADMIN_SEED_PASSWORD)) {
  throw new Error('ADMIN_SEED_PASSWORD must meet the password rules when running the seed script.');
}
if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('Access and refresh JWT secrets must be different.');
}
if (env.NODE_ENV === 'production') {
  let databaseUrl;
  try { databaseUrl = new URL(env.MONGODB_URI); } catch (_error) { throw new Error('MONGODB_URI must be a valid authenticated MongoDB connection string in production.'); }
  if (!['mongodb:', 'mongodb+srv:'].includes(databaseUrl.protocol) || !databaseUrl.username || !databaseUrl.password) {
    throw new Error('MONGODB_URI must use an authenticated MongoDB user in production.');
  }
}
if (env.JWT_ACCESS_SECRET.toLowerCase().includes('replace') || env.JWT_REFRESH_SECRET.toLowerCase().includes('replace') ||
    new Set(env.JWT_ACCESS_SECRET).size < 16 || new Set(env.JWT_REFRESH_SECRET).size < 16 ||
    new Set(env.DATA_ENCRYPTION_KEY).size < 20 || env.ADMIN_SEED_PASSWORD && new Set(env.ADMIN_SEED_PASSWORD).size < 8 ||
    new Set(env.BACKUP_ENCRYPTION_KEY).size < 10) {
  throw new Error('Replace sample secrets with independently generated random values.');
}

module.exports = Object.freeze(env);
