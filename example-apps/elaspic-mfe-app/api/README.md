# Elaspic API

Node.js **22** Express service that backs the Elaspic photo gallery. It handles user registration and login, opaque bearer sessions stored in MySQL, picture uploads with server-generated thumbnails, and comments on pictures.

## Architecture

```
src/
  index.js          # Express app bootstrap, error handling
  config.js         # Environment-driven settings
  db.js             # MySQL pool with startup retry
  middleware/
    auth.js         # Bearer token lookup (session_tokens)
  routes/
    auth.js         # /health, /register, /login, /logout, /me, /users
    pics.js         # /pics, /users/:userId/pics
    comments.js     # Comment CRUD (own vs other-user paths)
  utils/
    validation.js   # Request validation helpers
    password.js     # bcrypt(password + salt), session tokens
    images.js       # sharp thumbnails, data URLs
```

**Data flow:** The browser calls `/api/*`; nginx **strips** the `/api` prefix before proxying (e.g. `GET /api/me` → upstream `GET /me`). This service registers routes at the **root** (`/register`, `/me`, `/pics`, …).

**Storage:** MySQL **8** tables `users`, `session_tokens`, `pictures`, `comments` (see `../database/init/01-schema.sql`).

## Authentication

Only `POST /register`, `POST /login`, and `GET /health` are anonymous. All other endpoints require a valid bearer token:

```http
Authorization: Bearer <token>
```

**Session tokens (v1):** On successful login the API generates a cryptographically random token, persists it in MySQL (linked to `userId`, with `expiresAt`), and returns it in the JSON body (no httpOnly cookie). Each authenticated request looks up the token; missing, unknown, or expired tokens yield `401`. Default TTL is **24 hours** (`SESSION_TTL_SECONDS`). `POST /logout` (authenticated) deletes the current token row.

**Password hashing (v1 default):**

| Step | Behavior |
| --- | --- |
| Register | Generate `salt` (≥ 30 chars). Set `password_hash = bcrypt(password + salt, BCRYPT_ROUNDS)` (string concat, no delimiter). |
| Login | Load `salt` and `password_hash`; accept iff `bcrypt.compare(password + salt, password_hash)` is true. |

Use a standard Node bcrypt library; persist the full bcrypt string in `password_hash` (bcrypt’s internal salt is embedded; the app-level `salt` column is still required for verify).

## Endpoints

### Health & current user

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Liveness. Returns `200` with `{ "status": "ok" }` (no DB check in v1). |
| `GET` | `/me` | Yes | Current user for the shell header (email omitted): `{ "id", "username" }`. |

### Registration & login

**`POST /register`**

- Validates and creates a user.
- **username:** required, unique; alphanumeric and `_` only.
- **email:** required, unique; must be a valid email.
- **password:** required; min length **10** (letters, numbers, or special chars).

On validation failure → `400` with explicit field errors. Do **not** disclose whether username or email already exists → `409` with `{ "message": "username or email already registered" }`.

Example validation body:

```json
{
  "message": "Validation error",
  "errors": [
    { "field": "username", "message": "the username field contains invalid chars" },
    { "field": "email", "message": "the email field is not an email" },
    { "field": "password", "message": "the password field is too short" }
  ]
}
```

Success → **`201`**: `{ "id": "__UUID__", "username": "username" }`.

**`POST /login`**

- Accepts username and password only.
- Explicit field validation errors when format is wrong; otherwise invalid credentials → `401`:

```json
{ "message": "invalid username or password" }
```

Login flow: load `password_hash` and `salt` for username; if missing or `bcrypt.compare` fails, use the message above. Success → **`200`**: `{ "token": "_opaque_token_" }` (use `GET /me` for username after login).

**`POST /logout`** — authenticated; revokes current token → **`204`**.

### Users

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/users` | All registered users as `{ "id", "username" }`, sorted by `username` ascending (includes current user). |

Usernames are **immutable** after registration (no rename in v1).

### Pictures (own gallery)

Authenticated user context comes from the bearer token.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/pics` | Non-deleted pictures for current user; list items use **thumbnail** only. |
| `GET` | `/pics/:id` | Full `base64` image if owned and not deleted; else **404** (no disclosure for other users’ ids). |
| `POST` | `/pics` | `multipart/form-data`, field `image`; max **5 MB**; types `image/jpeg`, `image/png`, `image/webp`. Stores full image + server-generated thumbnail. |
| `DELETE` | `/pics/:id` | Soft delete (`deleted: true`); lists/detail treat as **404**. |

### Pictures (another user’s gallery)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/users/{userId}/pics` | That user’s non-deleted pictures (thumbnails in list). Unknown `userId` → **404**. |
| `GET` | `/users/{userId}/pics/{picId}` | Full picture when it exists, belongs to user, and is not soft-deleted; else **404**. |

`POST` / `PUT` / `DELETE` on another user’s pictures are not implemented.

### Comments

Request body for create/update:

```json
{ "comment": "text" }
```

`comment` is required, trimmed, length **1–2000** on `POST`/`PUT`.

| Context | Base path | Notes |
| --- | --- | --- |
| Own pictures | `/pics/:id/comments` | Use from the `/pics/{picId}` UI only. |
| Other user’s pictures | `/users/{userId}/pics/{picId}/comments` | Use from `/users/{userId}/pics/{picId}` UI only. |

Per path: `GET` non-deleted comments; `POST` add; `PUT`/`DELETE` only for comments the current user authored (logical delete on `DELETE`).

## Response conventions

Unless noted: JSON, `Content-Type: application/json`. Lists are **raw arrays** (no `{ "items": [] }` wrapper). Timestamps are ISO 8601. Internal fields (`deleted`, `salt`, `password_hash`, email) are **never** returned.

| Situation | Status | Body |
| --- | --- | --- |
| Validation failure | `400` | `{ "message": "Validation error", "errors": [{ "field", "message" }] }` |
| Duplicate register | `409` | `{ "message": "username or email already registered" }` |
| Bad credentials | `401` | `{ "message": "invalid username or password" }` |
| Missing/invalid token | `401` | `{ "message": "Unauthorized" }` |
| Not found / not allowed | `404` | `{ "message": "Not found" }` |
| Success, no body | `204` | empty (`DELETE` picture/comment, `POST /logout`) |

### Picture DTOs

**Summary** (lists + upload response):

```json
{
  "id": "__UUID__",
  "author": "username",
  "thumbnailBase64": "data:image/jpeg;base64,...",
  "createdAt": "2026-11-11T00:00:01"
}
```

**Detail:**

```json
{
  "id": "__UUID__",
  "author": "username",
  "base64": "data:image/png;base64,...",
  "createdAt": "2026-11-11T00:00:01"
}
```

| Endpoint | Success |
| --- | --- |
| `GET /pics`, `GET /users/{userId}/pics` | `200` — array of summaries |
| `GET /pics/:id`, `GET /users/{userId}/pics/{picId}` | `200` — detail object |
| `POST /pics` | `201` — summary (thumbnail ready) |
| Upload validation failure | `400` — e.g. field `image` |

### Comment DTO

```json
{
  "id": "__UUID__",
  "author": "username",
  "picture": "__PIC_UUID__",
  "comment": "hello",
  "createdAt": "2026-11-11T00:00:01"
}
```

| Operation | Success |
| --- | --- |
| `GET` collections | `200` — array, `createdAt` **descending**; soft-deleted omitted |
| `POST` | `201` — single object |
| `PUT` | `200` — updated object |

## Persistence models

IDs are UUID v4 (`crypto.randomUUID`). **Usernames are immutable**; `author` on pictures and comments stores username at write time.

**User** (never exposed on the wire):

```json
{
  "id": "__UUID__",
  "username": "username",
  "email": "user@elastic.co",
  "salt": "_random_string_",
  "password_hash": "bcrypt(password+salt)",
  "createdAt": "2026-11-11T00:00:01"
}
```

**Picture:**

```json
{
  "id": "__UUID__",
  "author": "_username_",
  "base64": "data:image/png;base64,AAA",
  "thumbnailBase64": "data:image/png;base64,BBB",
  "deleted": false,
  "createdAt": "2026-11-11T00:00:01"
}
```

**Session token** (bearer string only at login):

```json
{
  "token": "_opaque_random_string_",
  "userId": "__UUID__",
  "expiresAt": "2026-11-12T00:00:01",
  "createdAt": "2026-11-11T00:00:01"
}
```

**Comment:**

```json
{
  "id": "__UUID__",
  "author": "_username_",
  "picture": "picId",
  "comment": "hello",
  "deleted": false,
  "createdAt": "2026-11-11T00:00:01"
}
```

## Privacy

Email is stored for registration and authentication only. It must **never** appear in login responses, `/me`, user list payloads, picture/comment JSON, or error messages that could reveal another account’s email.

## Configuration

Connection uses `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` (no separate `DATABASE_URL` in v1 unless documented elsewhere).

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MYSQL_HOST` | yes | `database` | MySQL hostname (Docker network) |
| `MYSQL_PORT` | no | `3306` | MySQL port |
| `MYSQL_USER` | yes | — | Application DB user |
| `MYSQL_PASSWORD` | yes | — | Password for `MYSQL_USER` |
| `MYSQL_DATABASE` | yes | `elaspic` | Database name |
| `API_PORT` | no | `3000` | Express listen port (internal) |
| `SESSION_TTL_SECONDS` | no | `86400` | Session lifetime (24h) |
| `BCRYPT_ROUNDS` | no | `12` | Password hashing cost |
| `MAX_UPLOAD_BYTES` | no | `5242880` | Multipart upload cap (5 MB) |
| `THUMBNAIL_MAX_EDGE_PX` | no | `320` | Longest edge for thumbnails |
| `THUMBNAIL_JPEG_QUALITY` | no | `80` | JPEG/WebP thumbnail quality (1–100) |

**Health:** `GET /health` on this container, or `GET /api/health` through nginx, should return `200` when the process is up.

## Local development

```bash
cd api
npm install
export MYSQL_HOST=127.0.0.1 MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=elaspic
npm run dev
```

Prefer the full stack via Docker Compose (see root `README.md`). Compose services, nginx routing, and the full env table: [PROJECT.md](../PROJECT.md).