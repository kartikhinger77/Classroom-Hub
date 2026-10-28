# API reference

All API JSON responses use `{ "success": boolean, "data": object|null, "error": object|null }`. Private routes require `Authorization: Bearer <access-token>`. The refresh token is an httpOnly cookie. JSON request bodies are limited to 100 KiB. Uploaded PDFs use multipart field `pdf` and are limited to 10 MiB.

Common errors: `400 INVALID_INPUT` or `REQUEST_FAILED`; `401 UNAUTHENTICATED` or `INVALID_CREDENTIALS`; `403 FORBIDDEN` or `PASSWORD_CHANGE_REQUIRED`; `404 NOT_FOUND`; `409` for conflicts and last-admin protection; `413` for oversized uploads; `429 RATE_LIMITED`; `500 INTERNAL_ERROR` with a generic message.

## Health and public data

| Method and route | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /health` | Public | None | `{status:"ok"}` |
| `GET /ready` | Public | None | `{ready:boolean}`; 503 when MongoDB is disconnected. |
| `GET /api/settings/public` | Public | None | Student sign-up state and currently active announcement. |
| `POST /api/auth/register` | Public | `{name,email,password,role,policyAccepted:true}` | Created account id and email verification message; only student/teacher roles are accepted. |
| `POST /api/auth/verify-email` | Public | `{token}` | Confirms sign-up email or pending email change. |
| `POST /api/auth/login` | Public | `{email,password}` | Access token and user, or 202 with `{requiresTwoFactor,challenge}`. |
| `POST /api/auth/verify-2fa` | Public | `{challenge,code}` | Access token and user. |
| `POST /api/auth/refresh` | Refresh cookie | None | Rotated access token and refresh cookie. |
| `POST /api/auth/logout` | Refresh cookie | None | Invalidates refresh session and clears cookie. |
| `POST /api/auth/forgot-password` | Public | `{email}` | Same message for known and unknown addresses. |
| `POST /api/auth/reset-password` | Public | `{token,password}` | Changes password and revokes sessions. |
| `POST /api/auth/2fa/setup` | Signed-in user | `{password,enabled:true}` | One-time authenticator secret and setup URL. |
| `POST /api/auth/2fa/enable` | Signed-in user | `{code}` | Enables two-step verification. |
| `POST /api/auth/2fa/disable` | Signed-in user | `{password,enabled:false}` | Disables two-step verification. |
| `GET /api/subjects` | Signed-in user | None | Active subject names. |

## Account Center

| Method and route | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /api/account/me` | Any signed-in user | None | Own profile; no password hash or authenticator secret. |
| `PATCH /api/account/me` | Any signed-in user | `{name?,email?,bio?}` | Updated profile; email changes need confirmation. |
| `POST /api/account/avatar` | Any signed-in user | Multipart `avatar`, maximum 2 MiB | New private WebP avatar path. |
| `GET /api/account/avatar/:file` | Owner or admin | File name | Private WebP image, `nosniff`. |
| `POST /api/account/verify-email-change` | Any signed-in user | `{token}` | Confirms a pending email change. The public `/api/auth/verify-email` endpoint can also complete it from the emailed link. |
| `PATCH /api/account/password` | Any signed-in user | `{currentPassword,password}` | Changes own password and revokes other sessions. |
| `GET /api/account/sessions` | Any signed-in user | None | Own active sessions; token values are never returned. |
| `DELETE /api/account/sessions/:id` | Any signed-in user | Session id | Revokes own session only. |
| `POST /api/account/logout-all` | Any signed-in user | None | Revokes all own sessions and clears cookie. |
| `GET /api/account/export` | Any signed-in user | None | JSON export of own profile and activity. |
| `POST /api/account/delete` | Any signed-in user | `{password}` | Schedules deletion after seven days. |
| `POST /api/account/delete/cancel` | Any signed-in user | `{password}` | Cancels a pending deletion during its grace period. |

## Posts

| Method and route | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /api/posts` | Any signed-in user | `type`, `subject`, `q`, `from`, `to`, `page`, `limit`, `saved=true` query | Page of visible posts. Search strings are escaped; page size max 50. |
| `GET /api/posts/:id` | Any signed-in user | Post id | Post content and author display name/role. |
| `GET /api/posts/:id/file` | Any signed-in user | `download=1` to download | PDF stream with safe disposition and no-store headers. |
| `POST /api/posts` | Teacher or Admin | Multipart `type`, `title`, `subject`, `contentHtml?`, `pdf?` | Creates a note or exercise. Requires active subject and content or PDF. |
| `PATCH /api/posts/:id` | Owner Teacher or Admin | Multipart `title?`, `subject?`, `contentHtml?`, `pdf?` | Updates post and retains up to 10 content and PDF versions. |
| `DELETE /api/posts/:id` | Owner Teacher or Admin | Post id | Moves post to 30-day Trash. |
| `GET /api/posts/:id/history` | Owner Teacher or Admin | Post id | Last 10 retained versions, with PDF metadata but no private file path. |
| `POST /api/posts/:id/restore-version/:versionId` | Owner Teacher or Admin | IDs | Restores saved content and its PDF when the version's file is available. |
| `PUT /api/posts/:id/bookmark` | Any signed-in user | Post id | Saves post. |
| `DELETE /api/posts/:id/bookmark` | Any signed-in user | Post id | Removes saved post. |
| `GET /api/posts/notifications` | Any signed-in user | None | Recent post notifications for subjects the user has opened. |
| `PATCH /api/posts/notifications/:id/read` | Notification owner | Notification id | Marks own notification read. |
| `GET /api/posts/trash` | Admin | Pagination query | Trashed posts. |
| `POST /api/posts/:id/restore` | Admin | Post id | Restores a trashed post. |
| `DELETE /api/posts/:id/permanent` | Admin | Post id | Permanently removes a trashed post and related saved/notification records. |

## Admin

| Method and route | Role | Request | Response |
| --- | --- | --- | --- |
| `GET /api/admin/users` | Admin | `q`, `role`, `status`, `sort`, `direction`, `page`, `limit` | User list including names, email, role, status, last login, and joined date. Listing is audited. |
| `GET /api/admin/users/export` | Admin | None | CSV with spreadsheet formula escaping; export is audited. |
| `POST /api/admin/users` | Admin | `{name,email,role,password?}` | Creates verified account requiring password change; returns a generated one-time password if omitted. |
| `PATCH /api/admin/users/:id/status` | Admin | `{status:"active"|"suspended"}` | Changes status; suspending revokes sessions. |
| `POST /api/admin/users/:id/reset-password` | Admin | User id | One-time temporary password; forces change and revokes sessions. |
| `POST /api/admin/users/:id/verify-email` | Admin | User id | Marks a pending account verified and writes an audit record. |
| `DELETE /api/admin/users/:id` | Admin | User id | Removes account, sessions, bookmarks, notifications, and authored posts. Blocks self and last admin. |
| `GET /api/admin/audit` | Admin | `page`, `limit` | Paginated append-only audit entries; reading is audited. |
| `GET /api/admin/subjects` | Admin | None | All subjects and active state. |
| `POST /api/admin/subjects` | Admin | `{name}` | Adds a subject. |
| `PATCH /api/admin/subjects/:id` | Admin | `{name,active}` | Renames or activates/deactivates a subject. |
| `PATCH /api/admin/settings/studentSignupEnabled` | Admin | `{value:boolean}` | Controls Student self sign-up. |
| `PATCH /api/admin/settings/announcement` | Admin | `{value:{message,startsAt,endsAt}}` | Sets a short dated banner. |
| `GET /api/admin/dashboard` | Admin | None | User counts, posts per week, logins per day, and download counts. |
| `GET /api/admin/trash` | Admin | None | Recent trashed posts. |

## Permission summary

Students read and save material and manage their own account. Teachers can additionally create material and edit/trash posts they own. Admins can create material, manage any post, manage accounts and subjects, see email addresses, configure announcements, and read audit records. All these rules are checked by Express middleware and handlers.
