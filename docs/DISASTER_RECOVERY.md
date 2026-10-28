# Disaster recovery

## If the server is lost

1. Provision a patched host and restrict network ingress to the reverse proxy and administrator access.
2. Restore the encrypted backup key from the approved secret manager.
3. Deploy the exact reviewed release and set fresh app secrets. Do not reuse a possibly exposed host's JWT or encryption keys.
4. Restore the latest known-good database backup to a new MongoDB database and compare counts.
5. Restore the matching private uploads backup. MongoDB metadata without its PDF files is incomplete.
6. Update DNS and TLS, check `/health` and `/ready`, verify login and a sample PDF, and notify the school operations owner.

## If the database is corrupted

1. Stop writes and preserve a copy of the damaged database for investigation.
2. Select a backup from before the corruption and restore it into a new isolated database.
3. Verify user, post, audit, and session data. Assume sessions may have been exposed; revoke them and rotate access/refresh signing secrets.
4. Switch the app to the restored database after approval. Reconcile legitimate writes since the backup using reviewed records.

## If an admin account is compromised

1. Suspend the account and revoke its sessions.
2. Rotate all JWT signing secrets and the data encryption key if it may have been exposed. Reconfigure every app instance.
3. Run the server-only admin recovery command from `docs/ADMIN_GUIDE.md` and force a new password.
4. Review the append-only audit log and server access logs for changes, exports, and account resets.
5. Check for unauthorized users, subjects, posts, and announcements; restore approved backups if needed.
6. Notify affected users through the school's approved process and record the incident.
