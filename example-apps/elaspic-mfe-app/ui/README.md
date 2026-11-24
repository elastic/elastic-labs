# Elaspic UI host

Thin **Vite host** that boots the application: EUI theme/icons, `AuthProvider`, and `App` from `@elaspic/shell`. Feature code lives in workspace packages under `packages/`.

## Workspace packages

| Package | Team | Role |
| --- | --- | --- |
| `@elaspic/shell` | platform | Routing, layout, auth gates, error routes |
| `@elaspic/platform-sdk` | platform | API client, session token, `AuthProvider` / `useAuth` |
| `@elaspic/ui-kit` | platform | Shared EUI components |
| `@elaspic/mfe-identity` | identity | Login, register |
| `@elaspic/mfe-pics` | pics | My gallery |
| `@elaspic/mfe-users` | users | User directory and galleries |

Still **one browser bundle** (Phase 2); Module Federation comes in Phase 3.

This host tree:

```
src/
  main.jsx    # EuiProvider, router, AuthProvider, shell App
  icons.js    # EUI icon preload for Vite
  app.css     # Shell layout utilities
```

Screens and API behaviour are documented in the sections below (unchanged product behaviour).

Elaspic shows a gallery of photos the user has uploaded. Screens:

| Screen | Purpose |
| --- | --- |
| Login | Username and password; session is a bearer token for the SPA |
| Register | Username, email, password (linked from login) |
| Gallery | Grid of thumbnails plus **Add** to upload |
| Detail | Full-size image and comments (tags out of scope for v1) |
| Users | Browse other users and their galleries (authenticated) |

## Shell, routing, and auth

- **Default route:** `/login`.
- **Unauthenticated:** Any protected route redirects to `/login`.
- **Token:** Kept in memory and/or `sessionStorage` (per team convention). API calls use `Authorization: Bearer <token>` against `{PUBLIC_API_PREFIX}` (default `/api` on the same origin).
- **After login / on authenticated load:** Shell calls **`GET /api/me`** for `username` in the header.
- **Login / register:** Header and sidebar are **hidden**.
- **Authenticated chrome:**
  - **Header:** Elastic logo on the **left** (click → `/pics`); **username** and **logout** on the **right** (`POST /logout`, clear token, redirect to login).
  - **Sidebar:** Icons linking to `/pics` and `/users`.

No secrets in UI build environment variables.

## Routes & micro frontends

### `/login` — Login

- Username and password; client-side validation should match backend rules before `POST`.
- Link to `/register`.

### `/register` — Register

- Username, password, and email with client-side validation before `POST`.

### `/pics` — Pictures

| Route | Behavior |
| --- | --- |
| `/pics` | Grid using **thumbnail** fields from `GET /api/pics`. **Add** opens a file picker (`image/jpeg`, `image/png`, `image/webp`, ≤ 5 MB), uploads via `POST /api/pics` (`multipart`, field `image`), shows validation errors inline, refreshes grid on success. |
| `/pics/{picId}` | Full image and comments via `/api/pics/:id` and `/api/pics/:id/comments` (newest first, author username). User can add, **edit**, and delete **own** comments; navigate back to grid. |

### `/users` — Users

**URLs use user UUID, not username** (username is display-only).

| Route | Behavior |
| --- | --- |
| `/users` | List registered users (`id` + `username`); row click → `/users/{userId}`. |
| `/users/{userId}` | That user’s thumbnail grid. Unknown `userId` → redirect `/users`. |
| `/users/{userId}/pics/{picId}` | Detail via `GET /api/users/{userId}/pics/{picId}`; comments via `/api/users/{userId}/pics/{picId}/comments`. User can add, **edit**, and delete **own** comments. |

**Comment APIs (UI mapping):**

| View | Comment endpoints |
| --- | --- |
| Own gallery detail | `/api/pics/:id/comments` |
| Another user’s picture detail | `/api/users/{userId}/pics/{picId}/comments` |

Do not use the cross-user comments route on your own `/pics/{picId}` screen.

## API integration

The SPA talks to the API at `{PUBLIC_API_PREFIX}` on the same origin. Nginx strips `/api` when proxying to Express (e.g. browser `GET /api/me` → API `GET /me`).

Typical calls include: `POST /api/register`, `POST /api/login`, `GET /api/me`, `GET/POST /api/pics`, picture and user-gallery reads, and the comment routes above.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_PUBLIC_API_PREFIX` | `/api` | Browser-relative API base (build-time; maps to `PUBLIC_API_PREFIX` in compose docs) |

Canonical compose variable name for the stack is `PUBLIC_API_PREFIX` (see root `README.md`).

## Local development

Install once from the **repository root** (npm workspaces link all packages):

```bash
cd ..   # repo root
npm install
npm run dev:ui
```

Or from `ui/` after a root `npm install`:

```bash
cd ui
npm run dev
```

Run the API on port 3000 or adjust `vite.config.js` proxy. For nginx, database, and full stack setup see root `README.md`.