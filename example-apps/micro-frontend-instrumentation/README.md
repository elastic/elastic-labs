# Micro-frontends (Module Federation)

React + TypeScript monorepo with a **shell host** and two independently deployable **remotes**:

| Package | Role | Dev port | Exposes |
|--------|------|----------|---------|
| `@mfe/shell` | Host — loads remotes at runtime | 3000 | — |
| `@mfe/auth` | Login & registration (`/auth/*`) | 3001 | `auth/App` → `remoteEntry.js` |
| `@mfe/dashboard` | Placeholder dashboard (`/dashboard/*`) | 3002 | `dashboard/App` → `remoteEntry.js` |
| `@mfe/contracts` | Shared auth API types (no UI) | — | npm workspace only |
| `@mfe/api` | Auth REST API (`POST /auth/login`, `POST /auth/register`) | 4000 | — |

Webpack 5 **Module Federation** (`webpack.container.ModuleFederationPlugin`). You can swap in [`@module-federation/enhanced`](https://module-federation.io/) later for runtime plugins and manifests (Node 20+ recommended). `react`, `react-dom`, and `react-router-dom` are shared singletons so the shell and remotes share one router instance.

## Quick start (local dev)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm run dev` runs the shell, both remotes, and the API (ports 3000–3002 and 4000).

- Shell home: `/`
- Auth (remote routes): `/auth/login`, `/auth/register`
- Dashboard (remote): `/dashboard`

Each remote also runs standalone on its own port (useful for team-local development).

## Auth API

Express + TypeScript service in `packages/api`. Users are kept **in memory** (data is lost on restart). Passwords are hashed with bcrypt; successful auth returns a **JWT** matching `AuthSession` in `@mfe/contracts`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account (validates email, password ≥ 8 chars, display name 2–64 chars) |
| `POST` | `/auth/login` | Sign in with email + password |
| `GET` | `/health` | Liveness check |

Error responses use `{ code, message, fieldErrors? }` (aligned with `AuthApiError`).

```bash
npm run dev -w @mfe/api          # alone on port 4000
curl -s -X POST localhost:4000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1","displayName":"You"}'
```

The auth MFE calls the API via `authClient` (`AUTH_API_URL`, default `http://localhost:4000`). Set at build time for Docker:

```bash
AUTH_API_URL=http://localhost:4000 npm run build -w @mfe/auth
```

| Variable | Used by | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | API | Signing key (required in production) |
| `CORS_ORIGINS` | API | Comma-separated browser origins (default: allow all in dev) |
| `AUTH_API_URL` | auth MFE build | Browser-visible API base URL |

## Independent deploy

Each app builds to its own `dist/` and is served separately (Dockerfiles included).

### Build one app

```bash
npm run build -w @mfe/contracts   # required before auth
npm run build -w @mfe/auth
npm run build -w @mfe/dashboard
npm run build -w @mfe/shell
```

### Environment variables (production)

| Variable | Used by | Purpose |
|----------|---------|---------|
| `PUBLIC_PATH` | all webpack builds | Absolute URL prefix for assets (`remoteEntry.js` chunks) |
| `AUTH_REMOTE_URL` | shell build | Full URL to auth `remoteEntry.js` |
| `DASHBOARD_REMOTE_URL` | shell build | Full URL to dashboard `remoteEntry.js` |

Remote URLs are **browser-reachable** origins (not internal Docker DNS), because the shell downloads `remoteEntry.js` from the user's browser.

Example: deploy auth at `https://auth.example.com`, dashboard at `https://dashboard.example.com`, then build shell with:

```bash
AUTH_REMOTE_URL=https://auth.example.com/remoteEntry.js \
DASHBOARD_REMOTE_URL=https://dashboard.example.com/remoteEntry.js \
PUBLIC_PATH=https://app.example.com/ \
npm run build -w @mfe/shell
```

### Docker Compose (local prod-like)

```bash
docker compose up --build
```

Ports: shell `3000`, auth `3001`, dashboard `3002`, api `4000`.

## Layout

```
packages/
  shell/          # host
  auth/           # remote
  dashboard/      # remote
  contracts/      # shared types
  api/            # auth REST API
  webpack-shared/ # shared MF devServer + shared deps config
docker/
  Dockerfile.*
```

## Routing model

The shell defines top-level routes and lazy-loads each remote. Each remote owns **sub-routes** under its mount path (`remote-mount` pattern).