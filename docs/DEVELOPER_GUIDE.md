# Developer guide

## Folder map

- `config/`: environment validation, database connection, constants.
- `models/`: Mongoose collections and indexes.
- `routes/`: API route registration and request schemas.
- `controllers/`: route behavior and authorization-sensitive workflows.
- `middleware/`: authentication, roles, validation, uploads, rate limits, errors.
- `services/`: passwords, tokens, email, files, audit, retention, error tracking.
- `utils/`: logging, crypto, pagination, response helpers.
- `public/`: static HTML, CSS, JavaScript, logo, PWA shell.
- `scripts/`: admin seed, backup, restore, secret scan.
- `tests/`: security and API tests.
- `docs/`: guides, API, operations, recovery, change history.

## Add a route

1. Add a router under `routes/` and a handler under `controllers/`.
2. Validate all body, query, and path fields with a strict Zod schema.
3. Add `authenticate` for private endpoints and `requireRole` for elevated roles.
4. Check object ownership in the handler for every ID-based operation.
5. Use a field projection; never select `passwordHash` unless password verification requires it.
6. Record admin actions through `services/auditService.js`.
7. Add an integration test for allowed and denied roles, malformed input, and ownership.
8. Update `docs/API.md`.

## Coding rules

Use JavaScript, small controllers, strict validation, bounded queries, escaped output, and consistent `{ success, data, error }` responses. Do not log request bodies, secrets, full emails, tokens, or passwords. Keep route permissions on the server. Never expose uploaded files through static hosting.

## Commands

```sh
npm ci
npm run lint
npm test
npm audit --audit-level=high
npm run secret-scan
```
