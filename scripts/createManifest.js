const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'FILE_MANIFEST.md');
const excludedDirectories = new Set(['.git', 'node_modules', 'uploads', 'backups', 'coverage']);
const purposes = {
  '.env.example': 'Environment variable template with no real secrets.',
  'README.md': 'Project setup, deployment, security, and maintenance guide.',
  'START_HERE.md': 'Quick-start commands, environment variables, and launch checklist.',
  'FILE_MANIFEST.md': 'Inventory of every project file, its purpose, and its current line count.',
  'SECURITY.md': 'Security checklist and OWASP threat model.',
  'server.js': 'Connects MongoDB, starts Express, and handles graceful shutdown.',
  'app.js': 'Configures Express middleware, health checks, APIs, and static pages.',
  'middleware/auth.js': 'Verifies access JWTs, active sessions, account status, and required password changes.',
  'routes/auth.js': 'Express routes for sign-up, sign-in, 2FA, verification, and recovery.',
  'public/js/app.js': 'Notes, Exercise, account, admin, editor, and notification browser logic.',
  'public/js/auth.js': 'Sign-in, sign-up, verification, and password recovery browser logic.',
  '.github/workflows/ci.yml': 'Runs install, lint, tests, dependency audit, and source secret scan in CI.',
  '.dockerignore': 'Excludes local secrets, data, and development dependencies from Docker builds.',
  '.gitignore': 'Excludes environment secrets, dependencies, local uploads, and backups from Git.',
  'package.json': 'Pinned application dependencies and npm commands.',
  '.eslintrc.json': 'ESLint rules for server, tests, and browser JavaScript.',
  'jest.config.js': 'Jest test discovery and runtime configuration.',
  'Dockerfile': 'Multi-stage non-root production image.',
  'compose.yaml': 'Local app, MongoDB, and mail catcher services.',
  'compose.production.yaml': 'Production container deployment with resource limits.',
  'API.md': 'API route, permission, request, and response reference.',
  'COMPLETENESS_REPORT.md': 'Static scan findings and honest dependency, runtime, and QA status.',
  'ADMIN_GUIDE.md': 'Admin account, moderation, and recovery instructions.',
  'STUDENT_GUIDE.md': 'Student-facing mobile-first usage instructions.',
  'TEACHER_GUIDE.md': 'Teacher post creation and upload instructions.',
  'DEVELOPER_GUIDE.md': 'Code structure and contribution instructions.',
  'OPERATIONS.md': 'Health, logs, backups, restore, CI, load testing, and deployment operations.',
  'DISASTER_RECOVERY.md': 'Recovery procedures for server, database, and admin incidents.',
  'INCIDENT_RESPONSE.md': 'Security incident response checklist.',
  'RELEASE_CHECKLIST.md': 'Pre-release validation and sign-off tasks.',
  'CHANGELOG.md': 'Project change history.',
  'school-logo.svg': 'Replaceable school logo asset used throughout the site.',
  'app.css': 'Responsive visual system, components, themes, and accessibility styles.',
  'service-worker.js': 'Caches only the public app shell and clears it on logout.',
  'manifest.webmanifest': 'Installable web app metadata.',
  'createManifest.js': 'Regenerates the source-file manifest and line counts.'
};

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath));
    else if (entry.isFile() && entry.name !== '.env' && entry.name !== 'package-lock.json') files.push(absolutePath);
  }
  return files;
}

function purposeFor(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  const baseName = path.basename(relativePath);
  if (purposes[normalized]) return purposes[normalized];
  if (purposes[baseName]) return purposes[baseName];
  const directory = path.dirname(normalized).split('/')[0];
  const directoryPurposes = {
    config: 'Runtime environment, database, and shared configuration.',
    controllers: 'Validated request handlers and business logic.',
    middleware: 'Authentication, authorization, validation, upload, and error handling.',
    models: 'Mongoose schemas, constraints, and database indexes.',
    routes: 'Express API route definitions and access rules.',
    services: 'Authentication, files, mail, audit, retention, and privacy services.',
    utils: 'Shared response, logging, cryptography, and pagination helpers.',
    scripts: 'Seeding, operations, recovery, and project maintenance commands.',
    tests: 'Automated integration and security tests.',
    public: 'Browser page, style, script, and installable app asset.'
  };
  if (normalized.startsWith('docs/')) return 'Project guide and operational documentation.';
  return directoryPurposes[directory] || 'Project configuration or source file.';
}

function lineCount(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text) return 0;
  return text.split(/\r?\n/).length - (text.endsWith('\n') || text.endsWith('\r') ? 1 : 0);
}

function createManifest() {
  const files = listFiles(root).sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b)));
  const rows = files.map((filePath) => {
    const relativePath = path.relative(root, filePath);
    return `| \`${relativePath.replaceAll('\\', '/')}\` | ${purposeFor(relativePath)} | ${lineCount(filePath)} |`;
  });
  const content = [
    '# Classroom Hub file manifest',
    '',
    'Generated from the working project files. Runtime folders, installed dependencies, `.env`, and the unavailable generated `package-lock.json` are excluded.',
    '',
    '| Path | Purpose | Lines |',
    '| --- | --- | ---: |',
    ...rows,
    ''
  ].join('\n');
  fs.writeFileSync(manifestPath, content, 'utf8');
}

createManifest();
process.stdout.write(`Wrote FILE_MANIFEST.md for ${listFiles(root).length} project files.\n`);
