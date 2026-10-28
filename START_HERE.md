# START HERE

Classroom Hub is a school site for Notes and Exercise. Students read and save material. Teachers post material. Admins manage accounts and school settings.

## Run locally

Install Node.js 20+, MongoDB, and MongoDB Database Tools. Copy `.env.example` to `.env`, replace every sample value, and use a secure SMTP server or local mail catcher. This delivered workspace has no `package-lock.json` because the npm registry was unreachable during preparation. On a networked machine, run `npm install` once to generate it, review the audit output, and commit the lockfile. Use `npm ci` for later clean installs.

```sh
npm install
npm run seed
npm start
```

Open `http://localhost:3000`. For the local Docker services, set the local MongoDB variables in `.env` and use:

```sh
docker compose up -d mongodb mailpit
docker compose run --build --rm app npm run seed
docker compose up --build -d app
```

## Run in production

Set production secrets in the host process environment or `.env`, point MongoDB at Atlas with a least-privilege user, set the site URL to HTTPS, and configure SMTP. Put Caddy or Nginx in front of Node with a valid TLS certificate. Production Compose reads `.env.production` through its `env_file` setting.

```sh
npm install --omit=dev
npm run seed
NODE_ENV=production npm start
```

Remove `ADMIN_SEED_PASSWORD` from the runtime environment after seeding. For production Docker, run `docker compose -f compose.production.yaml run --build --rm app npm run seed` before `docker compose -f compose.production.yaml up --build -d`.

## Environment variables at a glance

- `NODE_ENV`, `PORT`: runtime mode and listening port.
- `APP_ORIGIN`, `PUBLIC_BASE_URL`: browser origin and public link base.
- `MONGODB_URI`: authenticated MongoDB connection.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: separate token signing keys.
- `DATA_ENCRYPTION_KEY`: 32-byte key for encrypted authenticator secrets.
- `ADMIN_SEED_NAME`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`: first admin setup values; set the password only for `npm run seed`, then remove it from the runtime environment. It is hashed before saving.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: verification and password reset delivery.
- `BACKUP_ENCRYPTION_KEY`: 64 hex characters for encrypted backups.
- `MONGODUMP_PATH`, `MONGORESTORE_PATH`: database tool paths.
- `SENTRY_DSN`: optional generic error tracking, blank disables it.
- `MONGO_INITDB_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`: local Compose MongoDB only.

## First five things after launch

1. Upload the school's approved logo to `public/assets/school-logo.svg` or update its reference.
2. Sign in as the seeded admin and change the temporary password immediately.
3. Create subjects and add the school accounts.
4. Review the draft Privacy and Terms pages with the school.
5. Enable HTTPS and daily encrypted backups, then test a restore.

## Checklist

- [ ] Upload the school logo.
- [ ] Set production `.env` values and rotate all sample values.
- [ ] Change the seeded admin password at first login.
- [ ] Enable HTTPS.
- [ ] Turn on backups and complete a restore drill.
- [ ] School reviews the draft privacy policy and terms.
- [ ] Decide whether Student self sign-up should remain enabled.
- [ ] Remove test accounts.
- [ ] Verify alert delivery.

See [README.md](README.md), [SECURITY.md](SECURITY.md), and [docs/OPERATIONS.md](docs/OPERATIONS.md) for details.
