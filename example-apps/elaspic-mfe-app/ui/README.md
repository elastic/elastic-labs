# Elaspic UI

React single-page application using [Elastic UI (EUI)](https://eui.elastic.co/). A shell layout (header, sidebar) hosts route-level **micro frontend** modules loaded with `React.lazy` and `Suspense`.

Elaspic shows a gallery of photos the user has uploaded. Screens:

| Screen | Purpose |
| --- | --- |
| Login | Username and password; session is a bearer token for the SPA |
| Register | Username, email, password (linked from login) |
| Gallery | Grid of thumbnails plus **Add** to upload |
| Detail | Full-size image and comments (tags out of scope for v1) |
| Users | Browse other users and their galleries (authenticated) |

## Architecture

The UI is a **single monorepo** (one build/deployable service). Team boundaries are **route-owned micro frontend modules** (folders/packages: login, register, pics, users), not separate remote bundles.

The shell owns layout and routing; each route **lazy-loads** its module via `React.lazy()` + `Suspense`.

```
src/
  main.jsx                 # EuiProvider, router, AuthProvider
  App.jsx                  # Top-level routes and auth gate
  api/client.js            # /api fetch wrapper + sessionStorage token
  auth/AuthContext.jsx     # Login state, GET /me for header username
  shell/                   # Layout chrome (hidden on /login, /register)
  microfrontends/
    login/                 # /login
    register/              # /register
    pics/                  # /pics, /pics/:picId
    users/                 # /users, /users/:userId, …/pics/:picId
  components/CommentPanel.jsx
```

Built with Vite, served as static files (nginx in the UI container), and reached through the edge **nginx** proxy (default host port `8080` in Docker Compose).

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

Canonical compose variable name for the stack is `PUBLIC_API_PREFIX` (see `../PROJECT.md`).

## Local development

```bash
cd ui
npm install
npm run dev
```

Run the API on port 3000 or adjust `vite.config.js` proxy. For nginx, database, and full stack setup see root `README.md` and `../PROJECT.md`.