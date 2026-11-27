# Micro-frontends (Module Federation)

React + TypeScript monorepo with a **shell host** and independently deployable **remotes**:

| Package | Role | Dev port | Exposes |
|--------|------|----------|---------|
| `@mfe/shell` | Host — loads remotes at runtime | 3000 | — |
| `@mfe/auth` | Login & registration (`/auth/*`) | 3001 | `auth/App` → `remoteEntry.js` |
| `@mfe/dashboard` | Photo gallery (`/dashboard/*`) | 3002 | `dashboard/App` → `remoteEntry.js` |
| `@mfe/photo` | Photo detail + comments (`/photo/:photoId`) | 3003 | `photo/App` → `remoteEntry.js` |
| `@mfe/contracts` | Shared auth API types (no UI) | — | npm workspace only |
| `@mfe/api` | REST API (auth + photos/comments) | 4000 | — |

Webpack 5 **Module Federation** (`webpack.container.ModuleFederationPlugin`). You can swap in [`@module-federation/enhanced`](https://module-federation.io/) later for runtime plugins and manifests (Node 20+ recommended). `react`, `react-dom`, and `react-router-dom` are shared singletons so the shell and remotes share one router instance.

## Quick start (local dev)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm run dev` runs the shell, remotes, and the API (ports 3000–3003 and 4000).

- Shell home: `/`
- Auth (remote routes): `/auth/login`, `/auth/register`
- Dashboard (remote): `/dashboard`
- Photo (remote): `/photo/:photoId` (open from a gallery card)

Each remote also runs standalone on its own port (useful for team-local development).

## API (`@mfe/api`)

Express + TypeScript service in `packages/api`. Users, photos, and comments are kept **in memory** (data is lost on restart). Sample photos are seeded on first read. Passwords are hashed with bcrypt; successful auth returns a **JWT** matching `AuthSession` in `@mfe/contracts`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account (validates email, password ≥ 8 chars, display name 2–64 chars) |
| `POST` | `/auth/login` | Sign in with email + password |
| `GET` | `/health` | Liveness check |

### Photos & comments

All photo/comment **reads are public**. **Creating comments** requires `Authorization: Bearer <accessToken>` from login/register.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/photos` | Paginated gallery (`page`, `pageSize`; default 1 / 20; newest first) |
| `GET` | `/photos/:photoId` | Photo detail + paginated comments (`commentPage`, `commentPageSize`; default 1 / 50; oldest first) |
| `POST` | `/photos/:photoId/comments` | Add comment (`body`; max 2000 chars after trim) |

DTO shapes live in `@mfe/contracts` (`PhotoSummary`, `PhotoDetail`, `Comment`, `Paginated`, `CreateCommentRequest`).

Error responses use `{ code, message, fieldErrors? }` (aligned with `AuthApiError`).

```bash
npm run dev -w @mfe/api          # alone on port 4000
curl -s -X POST localhost:4000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1","displayName":"You"}'

curl -s localhost:4000/photos | jq .
PHOTO_ID=$(curl -s localhost:4000/photos | jq -r '.items[0].id')
curl -s "localhost:4000/photos/$PHOTO_ID" | jq .
TOKEN=$(curl -s -X POST localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1"}' | jq -r '.accessToken')
curl -s -X POST "localhost:4000/photos/$PHOTO_ID/comments" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"body":"Nice photo."}' | jq .
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
| `API_URL` | dashboard / photo MFE build | Browser-visible API base URL (falls back to `AUTH_API_URL` or `http://localhost:4000`) |

## Independent deploy

Each app builds to its own `dist/` and is served separately (Dockerfiles included).

### Build one app

```bash
npm run build -w @mfe/contracts   # required before auth, dashboard, and photo
npm run build -w @mfe/auth
npm run build -w @mfe/dashboard
npm run build -w @mfe/photo
npm run build -w @mfe/shell
```

### Environment variables (production)

| Variable | Used by | Purpose |
|----------|---------|---------|
| `PUBLIC_PATH` | all webpack builds | Absolute URL prefix for assets (`remoteEntry.js` chunks) |
| `AUTH_REMOTE_URL` | shell build | Full URL to auth `remoteEntry.js` |
| `DASHBOARD_REMOTE_URL` | shell build | Full URL to dashboard `remoteEntry.js` |
| `PHOTO_REMOTE_URL` | shell build | Full URL to photo `remoteEntry.js` |

Remote URLs are **browser-reachable** origins (not internal Docker DNS), because the shell downloads `remoteEntry.js` from the user's browser.

Example: deploy auth at `https://auth.example.com`, dashboard at `https://dashboard.example.com`, then build shell with:

```bash
AUTH_REMOTE_URL=https://auth.example.com/remoteEntry.js \
DASHBOARD_REMOTE_URL=https://dashboard.example.com/remoteEntry.js \
PHOTO_REMOTE_URL=https://photo.example.com/remoteEntry.js \
PUBLIC_PATH=https://app.example.com/ \
npm run build -w @mfe/shell
```

### Docker Compose (local prod-like)

```bash
docker compose up --build
```

Ports: shell `3000`, auth `3001`, dashboard `3002`, photo `3003`, api `4000`.

## Layout

```
packages/
  shell/          # host
  auth/           # remote
  dashboard/      # remote
  photo/          # remote
  contracts/      # shared types
  api/            # auth REST API
  webpack-shared/ # shared MF devServer + shared deps config
docker/
  Dockerfile.*
```

## Routing model

The shell defines top-level routes and lazy-loads each remote. Each remote owns **sub-routes** under its mount path (`remote-mount` pattern).

## Browser telemetry (EDOT)

RUM is **shell-only**: vendored EDOT bundle under `packages/shell/public/vendor/`. Remotes do not load the agent; telemetry runs only at [http://localhost:3000](http://localhost:3000) (integrated shell).

| Doc | Purpose |
|-----|---------|
| [INSTRUMENTATION_PLAN.md](./INSTRUMENTATION_PLAN.md) | Full setup, team boundaries, rollout steps |

**Service** in Elastic: `photo-service-web`. Filter by **`team.name`**:

| Team | `team.name` | Owns |
|------|-------------|------|
| Platform / shell | `platform-shell` | Layout, home, remote loading |
| Auth MFE | `identity` | `/auth/*` |
| Dashboard MFE | `gallery` | `/dashboard/*` |
| Photo MFE | `media-detail` | `/photo/:photoId` |

Example Discover / Kibana filters:

- `service.name : "photo-service-web" and team.name : "identity"`
- `service.name : "photo-service-web" and team.name : "gallery"`

### Production-shaped shell (static `dist/`)

```bash
npm run build:shell:static   # PUBLIC_PATH=/ for same-origin assets
npm run serve:shell            # http://localhost:3456 — vendor + EDOT init from dist/
```

Set `PUBLIC_PATH`, `AUTH_REMOTE_URL`, etc. when building for real deploy (see [Independent deploy](#independent-deploy)). Docker shell image builds telemetry + shell and serves `dist/` including `/vendor/*`.

### Team checklist

1. Depend on `@mfe/telemetry`; wrap your remote `App` in `MicrofrontendBoundary` with your `TEAM_NAMES.*`.
2. Use `runWithTeam` for long-lived async work started outside React.
3. Validate in Elastic with your `team.name` filter only.
4. Do **not** add the EDOT script to remote `index.html` (standalone ports 3001–3003 export no browser OTLP).