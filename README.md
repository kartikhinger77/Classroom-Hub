# Classroom Hub

Classroom Hub is a small school portal for two kinds of learning material: Notes and Exercise. Students can browse, search, save, preview, and download material. Teachers can publish their own material. Admins can manage accounts, subjects, announcements, and moderation.

## Architecture

The browser downloads static HTML, CSS, JavaScript, and the school logo from Express. The browser sends JSON or multipart requests to the Express API. Express validates each request, checks an access JWT and the matching session where required, applies role and ownership rules, and reads or writes MongoDB documents through Mongoose. PDFs and resized WebP avatars live in a private `uploads/` directory and are streamed only after an authorized API request. Refresh JWTs are stored as hashes in session records; only the opaque cookie reaches the browser. Admin actions append entries to `auditLogs`.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB 7 or newer. MongoDB Atlas is suitable for production.
- MongoDB Database Tools (`mongodump` and `mongorestore`) for backups.
- An SMTP account or local SMTP catcher for verification and password reset links.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set each required value. Generate independent cryptographic values instead of keeping the examples. For `DATA_ENCRYPTION_KEY`, use `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"` (32 ASCII characters). For JWT and backup keys, use `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` (64 hex characters).
3. Start MongoDB and an SMTP service. The optional local Compose stack starts MongoDB and Mailpit.
4. This delivered workspace currently has no `package-lock.json` because the configured npm registry could not be reached during preparation. Run `npm install` once to resolve packages and generate the lockfile, review its audit output, and commit it. Use `npm ci` for subsequent clean installs.
5. Create the first admin with `npm run seed`.
6. Start the app with `npm start`, then open `http://localhost:3000`.

The server refuses to start when required settings are absent, secrets are too short or still sample values, access and refresh secrets match, or no admin account exists. `ADMIN_SEED_PASSWORD` is required only for `npm run seed`; after seeding, remove it from the runtime environment. The seed password is read only from that private environment variable and stored as a bcrypt hash. The first admin must change the account password before using the rest of the app.

### Docker local setup

Fill in `.env`, including `MONGO_INITDB_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD`, then run:

```sh
docker compose up -d mongodb mailpit
docker compose run --build --rm app npm run seed
docker compose up --build -d app
```

Mailpit's inbox is available at `http://localhost:8025`. This local Compose stack uses its MongoDB root account for convenience. Use a separate least-privilege database user in production.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; production enables HTTPS enforcement and HSTS. |
| `PORT` | HTTP listener port. |
| `APP_ORIGIN` | The one allowed browser origin, including scheme and port. |
| `MONGODB_URI` | MongoDB connection string. Use a least-privilege account. |
| `JWT_ACCESS_SECRET` | Independent secret for short-lived access JWTs. |
| `JWT_REFRESH_SECRET` | Independent secret for refresh JWTs. |
| `DATA_ENCRYPTION_KEY` | 32-byte AES-256-GCM key for authenticator secrets. |
| `ADMIN_SEED_NAME` | Name for the initial admin. |
| `ADMIN_SEED_EMAIL` | Gmail/email for the initial admin. |
| `ADMIN_SEED_PASSWORD` | One-time initial seed password required by `npm run seed`; remove it after seeding and never commit `.env`. |
| `SMTP_HOST`, `SMTP_PORT` | SMTP endpoint for verification and recovery messages. |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional SMTP authentication; both blank for a trusted local mail catcher. |
| `SMTP_FROM` | Sender address shown in email. |
| `PUBLIC_BASE_URL` | Public URL used to create verification and reset links. |
| `BACKUP_ENCRYPTION_KEY` | 32-byte key encoded as 64 hex characters for encrypted backups. Keep a secure offline copy. |
| `MONGODUMP_PATH`, `MONGORESTORE_PATH` | MongoDB Database Tools executables. |
| `SENTRY_DSN` | Optional error-tracking DSN; disabled when blank and sends generic events only. |
| `MONGO_INITDB_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD` | Local Docker-only MongoDB initialization values. |

## Admin password changes

The first admin must use the Account Center to change the temporary seed password immediately. Admins can reset other users with a one-time temporary password. A forgotten admin password is recovered only from the server using the procedure in [ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md); there is no website backdoor.

## Pages and routes

The interface includes sign-in, sign-up, verification, recovery, Notes and Exercise, post preview/editor, Account Center, Admin, Help, Privacy, Terms, and not-found pages. The API is documented in [API.md](docs/API.md). Admin-only and teacher/admin API actions are checked on the server; the UI does not grant permissions.

| Capability | Student | Teacher | Admin |
| --- | --- | --- | --- |
| Browse Notes and Exercise, preview/download PDFs, search/filter, save posts | Yes | Yes | Yes |
| Create posts | No | Yes | Yes |
| Edit or trash posts | No | Own posts | Any post |
| Manage own account and sessions | Yes | Yes | Yes |
| List emails and manage accounts | No | No | Yes |
| Manage subjects, announcements, audit, trash, and dashboard | No | No | Yes |

## Data and backup

Mongoose creates indexes for unique email, role/status, subject and date search, text search, and TTL cleanup. Run `npm run backup` daily using an OS scheduler. The script encrypts a `mongodump` archive with AES-256-GCM, retains 14 days, and deletes its plaintext temporary archive. Store a second copy in a separate protected location. Restore only after reviewing the destination and backup: set `RESTORE_CONFIRM=YES` and run `npm run restore -- backups/<backup-file>`. The restore command drops matching database collections. Follow the complete recovery notes in [DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md). A restore drill still needs to be run against your own MongoDB and backup key before launch.

## Deployment

1. Create an Atlas project and cluster. Allow-list only the production server's outbound IP. Do not allow public access from all addresses.
2. Create a database user limited to read/write access on the Classroom Hub database. Keep admin credentials separate.
3. Put secrets in the host's secret manager or protected environment file, not in the image or Git. Set `NODE_ENV=production`, `APP_ORIGIN` and `PUBLIC_BASE_URL` to the HTTPS site.
4. Put a reverse proxy such as Caddy or Nginx in front of Node and terminate HTTPS there. Forward the original HTTPS scheme. Restrict inbound ports to the proxy and administrative access.
5. Build the reviewed release. The production Compose example is non-root, read-only except uploads and `/tmp`, and has resource limits.
6. Set `ADMIN_SEED_PASSWORD` only for seeding. For PM2, run `npm run seed` in the prepared host environment before `pm2 start server.js --name classroom-hub`. For Docker, run `docker compose -f compose.production.yaml run --build --rm app npm run seed` before `docker compose -f compose.production.yaml up -d --build`. Remove `ADMIN_SEED_PASSWORD` from the runtime environment, then change the initial password at first sign-in.
7. Schedule encrypted backups daily, keep the encryption key separately, and complete a restore drill.
8. Configure alerting from [OPERATIONS.md](docs/OPERATIONS.md). The app exposes `/health` and `/ready`.

## Development quality commands

```sh
npm run lint
npm test
npm audit --audit-level=high
npm run secret-scan
```

Tests use an in-memory MongoDB server; the first run may need to download its MongoDB binary. Browser QA across Safari iOS, Android Chrome, Firefox, and Chrome is not automated by this repository. No Lighthouse or slow-network measurements are claimed; record them during school acceptance testing.

## Privacy and security

See [SECURITY.md](SECURITY.md) for the checklist and OWASP threat mapping. The privacy and terms pages are drafts and must be reviewed by the school with a qualified person before launch. No third-party analytics, ads, or remote fonts are loaded.

## Known limitations

- PDF magic-byte and MIME checks are implemented, but no malware scanner is connected. Add and test a school-approved scanning hook before accepting high-risk uploads.
- A local disk upload folder is used; production needs durable, encrypted storage and a tested backup plan for that folder as well as MongoDB.
- Email delivery, HTTPS termination, MongoDB Atlas networking, backup scheduling, Sentry delivery, and browser/device behavior depend on school infrastructure and require deployment verification.
- Some admin dialogs use native browser prompts and confirmations. A full usability and accessibility review is still needed.
- Load targets, Lighthouse targets, screen-reader behavior, and the full role-by-route matrix have not been measured in this environment.
