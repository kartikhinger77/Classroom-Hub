# Classroom Hub file manifest

Generated from the working project files. Runtime folders, installed dependencies, `.env`, and the unavailable generated `package-lock.json` are excluded.

| Path | Purpose | Lines |
| --- | --- | ---: |
| `.dockerignore` | Excludes local secrets, data, and development dependencies from Docker builds. | 11 |
| `.env.example` | Environment variable template with no real secrets. | 23 |
| `.eslintrc.json` | ESLint rules for server, tests, and browser JavaScript. | 13 |
| `.github/workflows/ci.yml` | Runs install, lint, tests, dependency audit, and source secret scan in CI. | 20 |
| `.gitignore` | Excludes environment secrets, dependencies, local uploads, and backups from Git. | 11 |
| `app.js` | Configures Express middleware, health checks, APIs, and static pages. | 114 |
| `compose.production.yaml` | Production container deployment with resource limits. | 29 |
| `compose.yaml` | Local app, MongoDB, and mail catcher services. | 50 |
| `config/constants.js` | Runtime environment, database, and shared configuration. | 9 |
| `config/db.js` | Runtime environment, database, and shared configuration. | 12 |
| `config/env.js` | Runtime environment, database, and shared configuration. | 56 |
| `controllers/accountController.js` | Validated request handlers and business logic. | 151 |
| `controllers/adminController.js` | Validated request handlers and business logic. | 231 |
| `controllers/authController.js` | Validated request handlers and business logic. | 240 |
| `controllers/postsController.js` | Validated request handlers and business logic. | 254 |
| `Dockerfile` | Multi-stage non-root production image. | 14 |
| `docs/ADMIN_GUIDE.md` | Admin account, moderation, and recovery instructions. | 29 |
| `docs/API.md` | API route, permission, request, and response reference. | 86 |
| `docs/CHANGELOG.md` | Project change history. | 19 |
| `docs/COMPLETENESS_REPORT.md` | Static scan findings and honest dependency, runtime, and QA status. | 41 |
| `docs/DEVELOPER_GUIDE.md` | Code structure and contribution instructions. | 40 |
| `docs/DISASTER_RECOVERY.md` | Recovery procedures for server, database, and admin incidents. | 26 |
| `docs/INCIDENT_RESPONSE.md` | Security incident response checklist. | 8 |
| `docs/OPERATIONS.md` | Health, logs, backups, restore, CI, load testing, and deployment operations. | 40 |
| `docs/RELEASE_CHECKLIST.md` | Pre-release validation and sign-off tasks. | 14 |
| `docs/STUDENT_GUIDE.md` | Student-facing mobile-first usage instructions. | 30 |
| `docs/TEACHER_GUIDE.md` | Teacher post creation and upload instructions. | 26 |
| `FILE_MANIFEST.md` | Inventory of every project file, its purpose, and its current line count. | 105 |
| `jest.config.js` | Jest test discovery and runtime configuration. | 7 |
| `middleware/asyncRoute.js` | Authentication, authorization, validation, upload, and error handling. | 6 |
| `middleware/auth.js` | Verifies access JWTs, active sessions, account status, and required password changes. | 46 |
| `middleware/errorHandler.js` | Authentication, authorization, validation, upload, and error handling. | 18 |
| `middleware/rateLimit.js` | Authentication, authorization, validation, upload, and error handling. | 14 |
| `middleware/rbac.js` | Authentication, authorization, validation, upload, and error handling. | 10 |
| `middleware/requestId.js` | Authentication, authorization, validation, upload, and error handling. | 7 |
| `middleware/upload.js` | Authentication, authorization, validation, upload, and error handling. | 43 |
| `middleware/validate.js` | Authentication, authorization, validation, upload, and error handling. | 12 |
| `models/AuditLog.js` | Mongoose schemas, constraints, and database indexes. | 25 |
| `models/Bookmark.js` | Mongoose schemas, constraints, and database indexes. | 10 |
| `models/LoginAttempt.js` | Mongoose schemas, constraints, and database indexes. | 10 |
| `models/LoginEvent.js` | Mongoose schemas, constraints, and database indexes. | 9 |
| `models/Notification.js` | Mongoose schemas, constraints, and database indexes. | 12 |
| `models/Post.js` | Mongoose schemas, constraints, and database indexes. | 41 |
| `models/Session.js` | Mongoose schemas, constraints, and database indexes. | 13 |
| `models/Setting.js` | Mongoose schemas, constraints, and database indexes. | 9 |
| `models/Subject.js` | Mongoose schemas, constraints, and database indexes. | 9 |
| `models/User.js` | Mongoose schemas, constraints, and database indexes. | 39 |
| `package.json` | Pinned application dependencies and npm commands. | 50 |
| `public/404.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/admin-guide.html` | Browser page, style, script, and installable app asset. | 1 |
| `public/assets/school-logo.svg` | Replaceable school logo asset used throughout the site. | 1 |
| `public/css/app.css` | Responsive visual system, components, themes, and accessibility styles. | 262 |
| `public/forgot.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/index.html` | Browser page, style, script, and installable app asset. | 50 |
| `public/js/app.js` | Notes, Exercise, account, admin, editor, and notification browser logic. | 554 |
| `public/js/auth.js` | Sign-in, sign-up, verification, and password recovery browser logic. | 109 |
| `public/login.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/manifest.webmanifest` | Installable web app metadata. | 10 |
| `public/privacy.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/reset.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/service-worker.js` | Caches only the public app shell and clears it on logout. | 22 |
| `public/signup.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/student-guide.html` | Browser page, style, script, and installable app asset. | 1 |
| `public/teacher-guide.html` | Browser page, style, script, and installable app asset. | 1 |
| `public/terms.html` | Browser page, style, script, and installable app asset. | 2 |
| `public/verify.html` | Browser page, style, script, and installable app asset. | 2 |
| `README.md` | Project setup, deployment, security, and maintenance guide. | 115 |
| `routes/account.js` | Express API route definitions and access rules. | 28 |
| `routes/admin.js` | Express API route definitions and access rules. | 28 |
| `routes/auth.js` | Express routes for sign-up, sign-in, 2FA, verification, and recovery. | 28 |
| `routes/posts.js` | Express API route definitions and access rules. | 73 |
| `routes/settings.js` | Express API route definitions and access rules. | 6 |
| `routes/subjects.js` | Express API route definitions and access rules. | 9 |
| `scripts/backup.js` | Seeding, operations, recovery, and project maintenance commands. | 61 |
| `scripts/checkIndexes.js` | Seeding, operations, recovery, and project maintenance commands. | 12 |
| `scripts/createManifest.js` | Regenerates the source-file manifest and line counts. | 105 |
| `scripts/loadTest.js` | Seeding, operations, recovery, and project maintenance commands. | 62 |
| `scripts/recoverAdmin.js` | Seeding, operations, recovery, and project maintenance commands. | 34 |
| `scripts/restore.js` | Seeding, operations, recovery, and project maintenance commands. | 58 |
| `scripts/secretScan.js` | Seeding, operations, recovery, and project maintenance commands. | 33 |
| `scripts/seed.js` | Seeding, operations, recovery, and project maintenance commands. | 39 |
| `SECURITY.md` | Security checklist and OWASP threat model. | 37 |
| `server.js` | Connects MongoDB, starts Express, and handles graceful shutdown. | 42 |
| `services/auditService.js` | Authentication, files, mail, audit, retention, and privacy services. | 22 |
| `services/errorTracking.js` | Authentication, files, mail, audit, retention, and privacy services. | 27 |
| `services/fileService.js` | Authentication, files, mail, audit, retention, and privacy services. | 68 |
| `services/loginAttemptService.js` | Authentication, files, mail, audit, retention, and privacy services. | 22 |
| `services/mailService.js` | Authentication, files, mail, audit, retention, and privacy services. | 15 |
| `services/passwordService.js` | Authentication, files, mail, audit, retention, and privacy services. | 26 |
| `services/privacyService.js` | Authentication, files, mail, audit, retention, and privacy services. | 22 |
| `services/retentionService.js` | Authentication, files, mail, audit, retention, and privacy services. | 52 |
| `services/tokenService.js` | Authentication, files, mail, audit, retention, and privacy services. | 68 |
| `START_HERE.md` | Quick-start commands, environment variables, and launch checklist. | 69 |
| `tests/integration.test.js` | Automated integration and security tests. | 286 |
| `tests/security.test.js` | Automated integration and security tests. | 49 |
| `utils/crypto.js` | Shared response, logging, cryptography, and pagination helpers. | 25 |
| `utils/logger.js` | Shared response, logging, cryptography, and pagination helpers. | 11 |
| `utils/pagination.js` | Shared response, logging, cryptography, and pagination helpers. | 9 |
| `utils/response.js` | Shared response, logging, cryptography, and pagination helpers. | 9 |
