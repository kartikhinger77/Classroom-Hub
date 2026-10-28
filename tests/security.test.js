process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
process.env.JWT_ACCESS_SECRET = ['unit-test', '-access-', 'key-value', '-17-abc'].join('');
process.env.JWT_REFRESH_SECRET = ['unit-test', '-refresh-', 'key-value', '-42-def'].join('');
process.env.DATA_ENCRYPTION_KEY = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6';
process.env.ADMIN_SEED_NAME = 'Test Admin';
process.env.ADMIN_SEED_EMAIL = 'admin@example.com';
process.env.ADMIN_SEED_PASSWORD = ['TestAdmin', 'Pass', '123'].join('');
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_FROM = 'Classroom Hub <test@example.com>';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.BACKUP_ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const crypto = require('node:crypto');
const { passwordRule } = require('../config/constants');
const { encryptSecret, decryptSecret, hashToken } = require('../utils/crypto');
const { sanitizeContent } = require('../controllers/postsController');

describe('security primitives', () => {
  test('server password policy requires length, upper, lower, and a digit', () => {
    expect(passwordRule.test('SecurePass123')).toBe(true);
    expect(passwordRule.test('short1A')).toBe(false);
    expect(passwordRule.test('lowercase123')).toBe(false);
  });

  test('encrypted authenticator secrets use authenticated encryption', () => {
    const key = '0123456789abcdef0123456789abcdef';
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(decryptSecret(encrypted, key)).toBe('JBSWY3DPEHPK3PXP');
    const changed = `${encrypted.slice(0, -1)}x`;
    expect(() => decryptSecret(changed, key)).toThrow();
  });

  test('sanitizer removes scripts and unsafe link schemes', () => {
    const output = sanitizeContent('<p>safe</p><script>alert(1)</script><a href="javascript:alert(1)">link</a>');
    expect(output).toContain('<p>safe</p>');
    expect(output).not.toContain('<script');
    expect(output).not.toContain('javascript:');
  });

  test('token hashes do not reveal the original token', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashed = hashToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(token);
  });
});
