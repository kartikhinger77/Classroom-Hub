# Admin guide

## Add and remove accounts

Open Admin, then Users. Select Add account, enter the name, Gmail/email, and role, then create the account. A generated temporary password is displayed once. Share it through an approved private channel; the user must change it on first sign-in. Search accounts by name or email. Use Suspend or Reactivate to change access. Remove asks for confirmation and deletes that user's posts and sessions. The admin cannot remove their own account or the last admin.

The user list includes email addresses. Opening or exporting the user list is recorded in the audit log. Exported CSV values are escaped against spreadsheet formulas.

If a student or teacher cannot confirm their email, use Verify email beside their account only after checking their identity through the school's approved process. This action is written to the audit log.

## Reset a password

Use Reset password beside the account. Share the one-time temporary password privately. The user must change it at their next sign-in.

## Audit log

Open Admin → Audit log. Entries include the actor label, action, target, timestamp, and IP. The log is append-only through the application model. Viewing the log is itself recorded.

## Subjects, announcements, and sign-up

Open Subjects to add and edit subject names and activate or deactivate them. Posts require an active subject. Open Settings to switch Student self sign-up on or off and publish an announcement with a start and end time.

## Change the seeded admin password

Sign in using the initial temporary password supplied to the seed command through the private environment. Remove `ADMIN_SEED_PASSWORD` from the server's runtime environment after seeding. Open Account and change the password immediately. The app forces this change before other pages are available.

## Forgotten admin password recovery

There is no website bypass. On the server, set `RECOVERY_CONFIRM=YES` and `RECOVERY_ADMIN_EMAIL` in the protected shell environment, confirm `MONGODB_URI` points to the intended database, and run `npm run recover-admin`. The script revokes all sessions, forces a password change, and writes the generated temporary password to a randomly named file in the server's temporary directory with owner-only permissions. Read it through the server shell, send it to the verified admin through an approved private channel, then delete the file. Review audit logs and revoke sessions if compromise is suspected. Never put the temporary password in a command argument, terminal transcript, or log.
