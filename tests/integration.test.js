const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.mock('../services/mailService', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));

let mongo;
let mongoose;
let app;
let User;
let Subject;
let Post;
let AuditLog;
let hashPassword;
let testUploadRoot;
let removeFile;

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = ['unit-test', '-access-', 'key-value', '-17-abc'].join('');
process.env.JWT_REFRESH_SECRET = ['unit-test', '-refresh-', 'key-value', '-42-def'].join('');
process.env.DATA_ENCRYPTION_KEY = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6';
process.env.ADMIN_SEED_NAME = 'Test Administrator';
process.env.ADMIN_SEED_EMAIL = 'admin@example.com';
process.env.ADMIN_SEED_PASSWORD = ['TestAdmin', 'Pass', '123'].join('');
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1025';
process.env.SMTP_FROM = 'Classroom Hub <test@example.com>';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.BACKUP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/classroom_hub_test';

const testPassword = ['Secure', 'Pass', '123'].join('');

async function createUser(email, role, name = role) {
  return User.create({ name, email, role, passwordHash: await hashPassword(testPassword), emailVerifiedAt: new Date() });
}

async function login(email = 'student@gmail.com') {
  return request(app).post('/api/auth/login').send({ email, password: testPassword });
}

function bearer(response) { return `Bearer ${response.body.data.accessToken}`; }

function makePdf() {
  let source = '%PDF-1.4\n';
  const offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>'
  ];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 3\n0000000000 65535 f \n${offsets[1].toString().padStart(10, '0')} 00000 n \n${offsets[2].toString().padStart(10, '0')} 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
}

beforeAll(async () => {
  // Keep test uploads in a private, uniquely named temporary directory.
  testUploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-hub-tests-'));
  process.env.CLASSROOM_UPLOAD_DIRECTORY = testUploadRoot;
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  app = require('../app');
  User = require('../models/User');
  Subject = require('../models/Subject');
  Post = require('../models/Post');
  AuditLog = require('../models/AuditLog');
  hashPassword = require('../services/passwordService').hashPassword;
  removeFile = require('../services/fileService').removeFile;
  await Promise.all([User.createIndexes(), Subject.createIndexes(), Post.createIndexes(), AuditLog.createIndexes()]);
});

afterEach(async () => {
  // Remove only files created by this test suite, never the application's upload directory.
  const savedPosts = await Post.find({ 'pdf.fileName': { $type: 'string' } }).select('pdf.fileName').lean();
  await Promise.all(savedPosts.map((post) => removeFile(post.pdf.fileName)));
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  // The resolved path is guaranteed to be the unique directory created above.
  if (testUploadRoot && path.dirname(testUploadRoot) === os.tmpdir() && path.basename(testUploadRoot).startsWith('classroom-hub-tests-')) {
    await fs.rm(testUploadRoot, { recursive: true, force: true });
  }
});

describe('authentication and input validation', () => {
  test('rejects NoSQL injection and mass-assigned admin role at registration', async () => {
    const injected = await request(app).post('/api/auth/register').send({ name: 'Bad', email: { $gt: '' }, password: testPassword, role: 'student', policyAccepted: true });
    expect(injected.status).toBe(400);
    const escalated = await request(app).post('/api/auth/register').send({ name: 'Bad', email: 'bad@gmail.com', password: testPassword, role: 'admin', policyAccepted: true });
    expect(escalated.status).toBe(400);
    expect(JSON.stringify(escalated.body)).not.toContain('passwordHash');
  });

  test('uses a generic error and locks the account after five wrong passwords', async () => {
    const student = await createUser('student@gmail.com', 'student');
    let response;
    for (let attempt = 0; attempt < 5; attempt += 1) response = await request(app).post('/api/auth/login').send({ email: student.email, password: ['Wrong', 'Pass', '123'].join('') });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password.');
    const locked = await login(student.email);
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toBe('Invalid email or password.');
    const updated = await User.findById(student._id);
    expect(updated.failedLoginCount).toBe(5);
    expect(updated.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test('rotates refresh tokens and rejects reuse by revoking the session', async () => {
    const student = await createUser('student@gmail.com', 'student');
    const signedIn = await login(student.email);
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    const oldCookie = signedIn.headers['set-cookie'][0].split(';')[0];
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(rotated.status).toBe(200);
    const reused = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(reused.status).toBe(401);
    const latestCookie = rotated.headers['set-cookie'][0].split(';')[0];
    const revoked = await request(app).post('/api/auth/refresh').set('Cookie', latestCookie);
    expect(revoked.status).toBe(401);
  });

  test('logout from all devices revokes every refresh session', async () => {
    const student = await createUser('student@gmail.com', 'student');
    const firstLogin = await login(student.email);
    const secondLogin = await login(student.email);
    const firstCookie = firstLogin.headers['set-cookie'][0].split(';')[0];
    const secondCookie = secondLogin.headers['set-cookie'][0].split(';')[0];
    const signedOut = await request(app).post('/api/account/logout-all').set('Authorization', bearer(firstLogin));
    expect(signedOut.status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', firstCookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', secondCookie)).status).toBe(401);
  });
});

describe('roles, posts, and uploads', () => {
  test('students cannot create posts or read admin routes', async () => {
    const student = await createUser('student@gmail.com', 'student');
    const signedIn = await login(student.email);
    const post = await request(app).post('/api/posts').set('Authorization', bearer(signedIn)).field('type', 'note').field('title', 'Attempt').field('subject', 'Math').field('contentHtml', 'No');
    expect(post.status).toBe(403);
    const admin = await request(app).get('/api/admin/users').set('Authorization', bearer(signedIn));
    expect(admin.status).toBe(403);
  });

  test('teacher writes sanitized content and students can view it; another teacher cannot edit it', async () => {
    const teacher = await createUser('teacher@gmail.com', 'teacher', 'Writer');
    const otherTeacher = await createUser('other@gmail.com', 'teacher', 'Other');
    const student = await createUser('student@gmail.com', 'student');
    await Subject.create({ name: 'Math', createdBy: teacher._id });
    const teacherSession = await login(teacher.email);
    const created = await request(app).post('/api/posts').set('Authorization', bearer(teacherSession))
      .field('type', 'note').field('title', 'Fractions').field('subject', 'Math')
      .field('contentHtml', '<p>Useful</p><script>alert(1)</script>');
    expect(created.status).toBe(201);
    expect(created.body.data.contentHtml).not.toContain('<script');
    const studentSession = await login(student.email);
    const list = await request(app).get('/api/posts?type=note').set('Authorization', bearer(studentSession));
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].title).toBe('Fractions');
    const massAssignment = await request(app).patch(`/api/posts/${created.body.data._id}`).set('Authorization', bearer(teacherSession)).send({ title: 'Escalated', author: String(otherTeacher._id), deletedAt: new Date().toISOString() });
    expect(massAssignment.status).toBe(400);
    const otherSession = await login(otherTeacher.email);
    const edited = await request(app).patch(`/api/posts/${created.body.data._id}`).set('Authorization', bearer(otherSession)).field('title', 'Changed');
    expect(edited.status).toBe(403);
  });

  test('owners can compare retained versions and restore an earlier version', async () => {
    const teacher = await createUser('teacher@gmail.com', 'teacher');
    await Subject.create({ name: 'Math', createdBy: teacher._id });
    const signedIn = await login(teacher.email);
    const created = await request(app).post('/api/posts').set('Authorization', bearer(signedIn))
      .send({ type: 'note', title: 'Draft one', subject: 'Math', contentHtml: '<p>First draft</p>' });
    const edited = await request(app).patch(`/api/posts/${created.body.data._id}`).set('Authorization', bearer(signedIn))
      .send({ title: 'Draft two', contentHtml: '<p>Second draft</p>' });
    expect(edited.status).toBe(200);
    const history = await request(app).get(`/api/posts/${created.body.data._id}/history`).set('Authorization', bearer(signedIn));
    expect(history.body.data[0].contentHtml).toContain('First draft');
    const restored = await request(app).post(`/api/posts/${created.body.data._id}/restore-version/${history.body.data[0]._id}`).set('Authorization', bearer(signedIn));
    expect(restored.status).toBe(200);
    expect(restored.body.data.contentHtml).toContain('First draft');
  });

  test('rejects a renamed non-PDF file even when the HTTP MIME claims PDF', async () => {
    const teacher = await createUser('teacher@gmail.com', 'teacher');
    await Subject.create({ name: 'Math', createdBy: teacher._id });
    const signedIn = await login(teacher.email);
    const response = await request(app).post('/api/posts').set('Authorization', bearer(signedIn))
      .field('type', 'note').field('title', 'Fake file').field('subject', 'Math')
      .attach('pdf', Buffer.from('<html>not a pdf</html>'), { filename: 'payload.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(400);
    expect(await Post.countDocuments({})).toBe(0);
  });

  test('stores and serves a valid PDF, and rejects a truncated PDF', async () => {
    const teacher = await createUser('teacher@gmail.com', 'teacher');
    const student = await createUser('student@gmail.com', 'student');
    await Subject.create({ name: 'Math', createdBy: teacher._id });
    const teacherSession = await login(teacher.email);
    const created = await request(app).post('/api/posts').set('Authorization', bearer(teacherSession))
      .field('type', 'note').field('title', 'PDF note').field('subject', 'Math')
      .attach('pdf', makePdf(), { filename: 'lesson.pdf', contentType: 'application/pdf' });
    expect(created.status).toBe(201);
    expect(created.body.data.pdf.available).toBe(true);
    const studentSession = await login(student.email);
    const downloaded = await request(app).get(`/api/posts/${created.body.data._id}/file?download=1`).set('Authorization', bearer(studentSession));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toMatch(/application\/pdf/);
    const corrupt = await request(app).post('/api/posts').set('Authorization', bearer(teacherSession))
      .field('type', 'note').field('title', 'Broken PDF').field('subject', 'Math')
      .attach('pdf', Buffer.from('%PDF-1.4\ntruncated'), { filename: 'broken.pdf', contentType: 'application/pdf' });
    expect(corrupt.status).toBe(400);
    expect(await Post.countDocuments({})).toBe(1);
  });

  test('PDF edits stay in version history and can restore the earlier file', async () => {
    const teacher = await createUser('teacher@gmail.com', 'teacher');
    await Subject.create({ name: 'Math', createdBy: teacher._id });
    const signedIn = await login(teacher.email);
    const created = await request(app).post('/api/posts').set('Authorization', bearer(signedIn))
      .field('type', 'note').field('title', 'PDF history').field('subject', 'Math')
      .attach('pdf', makePdf(), { filename: 'first.pdf', contentType: 'application/pdf' });
    const edited = await request(app).patch(`/api/posts/${created.body.data._id}`).set('Authorization', bearer(signedIn))
      .attach('pdf', makePdf(), { filename: 'second.pdf', contentType: 'application/pdf' });
    expect(edited.status).toBe(200);
    const history = await request(app).get(`/api/posts/${created.body.data._id}/history`).set('Authorization', bearer(signedIn));
    expect(history.body.data[0].pdf.originalName).toBe('first.pdf');
    expect(history.body.data[0].pdf.fileName).toBeUndefined();
    const restored = await request(app).post(`/api/posts/${created.body.data._id}/restore-version/${history.body.data[0]._id}`).set('Authorization', bearer(signedIn));
    expect(restored.status).toBe(200);
    expect(restored.body.data.pdf.originalName).toBe('first.pdf');
  });
});

describe('admin and audit controls', () => {
  test('admin can see emails, create an account, and logs the action', async () => {
    const admin = await createUser('admin@gmail.com', 'admin', 'Admin');
    const signedIn = await login(admin.email);
    const created = await request(app).post('/api/admin/users').set('Authorization', bearer(signedIn)).send({ name: 'New teacher', email: 'new@gmail.com', role: 'teacher' });
    expect(created.status).toBe(201);
    expect(created.body.data.user.email).toBe('new@gmail.com');
    expect(created.body.data.temporaryPassword).toMatch(/[A-Z]/);
    expect(created.body.data.temporaryPassword).toMatch(/[a-z]/);
    const listed = await request(app).get('/api/admin/users').set('Authorization', bearer(signedIn));
    expect(listed.body.data.items.map((user) => user.email)).toContain('new@gmail.com');
    expect(JSON.stringify(listed.body)).not.toContain('passwordHash');
    expect(await AuditLog.exists({ action: 'admin.user.create' })).toBeTruthy();
  });

  test('admin can verify an account manually and the action is audited', async () => {
    const admin = await createUser('admin@gmail.com', 'admin', 'Admin');
    const pending = await User.create({ name: 'Pending teacher', email: 'pending@gmail.com', role: 'teacher', passwordHash: await hashPassword(testPassword) });
    const signedIn = await login(admin.email);
    const verified = await request(app).post(`/api/admin/users/${pending._id}/verify-email`).set('Authorization', bearer(signedIn));
    expect(verified.status).toBe(200);
    expect(verified.body.data.user.emailVerifiedAt).toBeTruthy();
    expect(await AuditLog.exists({ action: 'admin.user.verify_email', targetId: String(pending._id) })).toBeTruthy();
  });

  test('admin cannot remove self or last admin and audit log model rejects mutation', async () => {
    const admin = await createUser('admin@gmail.com', 'admin');
    const signedIn = await login(admin.email);
    const self = await request(app).delete(`/api/admin/users/${admin._id}`).set('Authorization', bearer(signedIn));
    expect(self.status).toBe(409);
    const second = await User.create({ name: 'Second admin', email: 'second@gmail.com', role: 'admin', passwordHash: await hashPassword(testPassword), emailVerifiedAt: new Date() });
    await User.deleteOne({ _id: second._id });
    const last = await request(app).delete(`/api/admin/users/${admin._id}`).set('Authorization', bearer(signedIn));
    expect(last.status).toBe(409);
    await AuditLog.create({ action: 'test.entry' });
    await expect(AuditLog.updateMany({}, { $set: { action: 'changed' } })).rejects.toThrow('append-only');
  });
});
