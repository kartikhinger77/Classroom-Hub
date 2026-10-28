# Security checklist and threat model

## Operational checklist

- [x] Access JWTs are short-lived; access and refresh keys are distinct; HS256 is pinned; issuer and audience are checked.
- [x] Refresh JWTs rotate and are stored hashed in sessions. Reuse revokes the session.
- [x] Password hashes use bcrypt cost 12 and are excluded from normal queries. Login errors are generic, unknown addresses pay a dummy bcrypt comparison, and five wrong attempts lock an account for 15 minutes.
- [x] Role checks, post ownership checks, strict request schemas, bounded pagination, escaped search strings, and server-side email verification are enforced.
- [x] HTML is sanitized on write. Browser output uses text escaping except the server-sanitized rich-text field.
- [x] PDF extension/MIME and `%PDF-` signature are checked, names on disk are random, size is capped at 10 MiB, and downloads use safe headers.
- [x] Refresh cookies are httpOnly, SameSite=Strict, and Secure in production. Production requires HTTPS. Helmet sets CSP, HSTS, frame restrictions, referrer and permissions policies.
- [x] CORS accepts only the configured application origin. Browser requests with a different Origin are rejected.
- [x] User data is projected, avatar images are decoded/re-encoded to 256px WebP, 2 MiB max, and private uploads are not statically served.
- [x] Admin audit records block Mongoose update/delete methods. Admin account, setting, post moderation, list, export, and audit-read actions are recorded.
- [x] `.env`, uploads and backups are ignored. Logs redact credential-like fields and do not log full email addresses or request bodies.
- [ ] No malware scanner is wired to PDF uploads. Connect a school-approved scanner hook.
- [ ] Backups and restore must be run and verified by the deploying school.
- [ ] Atlas network policy, SMTP, HTTPS, monitoring, storage durability, and alert destinations require deployment-specific setup.

## OWASP Top 10 mapping

| Area | Main controls | Remaining concern |
| --- | --- | --- |
| A01 Broken Access Control | Server role middleware, owner/admin checks, session binding, admin self/last-admin deletion guard. | Complete external role-by-route penetration walk is not yet performed. |
| A02 Cryptographic Failures | bcrypt, TLS requirement in production, separate JWT keys, AES-256-GCM for TOTP, encrypted backups. | Key rotation and secure key escrow must be operated by the school. |
| A03 Injection | Zod schemas, Mongo sanitize, strict Mongoose queries, escaped regex, parameterized child-process args. | Review new filters before adding them. |
| A04 Insecure Design | Email verification, lockout, reset tokens, audit trail, minimum data collection. | No rate-limit shared store is configured for multi-instance deployments. |
| A05 Security Misconfiguration | Helmet CSP, no-store API responses, same-origin CORS, no external fonts/trackers, production HTTPS guard. | Reverse proxy must forward the correct protocol and use TLS correctly. |
| A06 Vulnerable Components | Direct package versions are pinned and CI is configured for npm audit. | No generated lockfile or completed audit is available in this workspace; registry access is required before release. |
| A07 Identification and Authentication Failures | Bcrypt dummy comparison, generic errors, 5-attempt lock, session rotation/reuse detection, optional TOTP. | Email deliverability and TOTP enrollment require live deployment tests. |
| A08 Software and Data Integrity Failures | Strict input, server sanitization, PDF signature checks, append-only audit model hooks, CI. | Local filesystem uploads need durable backup and restore coverage. |
| A09 Security Logging and Monitoring Failures | Structured logs, request IDs, PII-redacted Sentry hook, audit collection, documented alert thresholds. | Alert routing and thresholds are not configured by source code alone. |
| A10 SSRF | No user-controlled remote fetch or URL preview feature is implemented. | Reassess if importing external URLs is added. |

## Threat assumptions

Assume an untrusted student can call APIs directly, submit malformed JSON, attempt NoSQL operators, upload a renamed executable, replay a stolen refresh token, inspect client code, and try to edit another user's post. The server treats browser controls as convenience only. An attacker with server environment access, database administrator access, filesystem access, or a compromised school mailbox is outside the app's ability to contain; rotate keys, revoke sessions, inspect audit logs, and reset affected credentials in response.
