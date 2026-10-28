# Operations and reliability

## Health and monitoring

- `GET /health` reports that the process is answering.
- `GET /ready` returns success only when MongoDB is connected.
- Logs are JSON with a request ID, method, path, status, duration, and IP. They do not include request bodies, emails, passwords, tokens, or stack traces.
- `SENTRY_DSN` enables a Sentry-compatible hook. Events are reduced to a generic service error marker with no request details.

Configure your monitoring provider to alert when the 5-minute error rate exceeds 2%, `/ready` fails, disk usage exceeds 85%, or failed login/429 rates indicate more than 50 failures per minute. The application does not configure external alert delivery or disk monitoring. The in-process rate limiter is not shared among multiple Node instances; use a shared store at scale.

## Graceful shutdown

The server stops accepting new connections on SIGTERM or SIGINT, waits for active requests, stops the retention scheduler, then closes MongoDB. The container should receive SIGTERM and allow at least 15 seconds of shutdown grace.

## Daily encrypted backups

Install MongoDB Database Tools and schedule `npm run backup` once each day. The script creates a compressed archive, encrypts it with AES-256-GCM, stores it under `backups/`, retains 14 days locally, and removes plaintext temporary files. Copy encrypted backups to a separate protected host or object store. Keep `BACKUP_ENCRYPTION_KEY` in a separate secret manager and test that it can be retrieved during recovery.

## Restore drill

1. Create an isolated staging database with a least-privilege restore account.
2. Choose an encrypted backup and confirm the backup key is available.
3. Set `MONGODB_URI` to the staging database, set `RESTORE_CONFIRM=YES`, and run `npm run restore -- backups/<backup-file>`.
4. Start the app against staging and verify account, post, audit, and PDF metadata counts. Compare a known test record and open a sample PDF.
5. Remove the staging database after documenting the date, backup name, counts, and duration.

This restore flow has not been executed against a real MongoDB server in this workspace. Mark the launch checklist complete only after the school performs the drill.

## Disaster recovery

See [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md). For daily incidents, use [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

## CI and load testing

GitHub Actions runs install, lint, tests, dependency audit, and the source secret scan for each push and pull request. Run `npm run check-indexes` against the target database to inspect execution plans. Run `npm run load` against a staging server with `LOAD_BASE_URL`, an Admin `LOAD_ACCESS_TOKEN`, and an active `LOAD_SUBJECT`. The script sends 200 concurrent post-list requests and 20 valid PDF uploads, then deletes the temporary posts, and reports status counts and latency percentiles. Neither command has been run against a deployed environment in this workspace.

## Container deployment

The Dockerfile uses a production dependency stage, runs as the non-root `node` user, and excludes `.env` and data folders from the image. `compose.production.yaml` sets a read-only root filesystem, a writable uploads volume and temporary filesystem, health checks, and resource limits. Provide a trusted reverse proxy for TLS and configure the Atlas IP allow-list.
