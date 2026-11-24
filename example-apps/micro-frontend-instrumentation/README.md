# Micro-frontends (Module Federation)

React + TypeScript monorepo with a **shell host** and two independently deployable **remotes**:

| Package | Role | Dev port | Exposes |
|--------|------|----------|---------|
| `@mfe/shell` | Host — loads remotes at runtime | 3000 | — |
| `@mfe/auth` | Login & registration (`/auth/*`) | 3001 | `auth/App` → `remoteEntry.js` |
| `@mfe/dashboard` | Placeholder dashboard (`/dashboard/*`) | 3002 | `dashboard/App` → `remoteEntry.js` |
| `@mfe/contracts` | Shared auth API types (no UI) | — | npm workspace only |

Webpack 5 **Module Federation** (`webpack.container.ModuleFederationPlugin`). You can swap in [`@module-federation/enhanced`](https://module-federation.io/) later for runtime plugins and manifests (Node 20+ recommended). `react`, `react-dom`, and `react-router-dom` are shared singletons so the shell and remotes share one router instance.

## Quick start (local dev)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Start auth and dashboard dev servers (ports 3001 and 3002) before navigating to federated routes — `npm run dev` runs all three.

- Shell home: `/`
- Auth (remote routes): `/auth/login`, `/auth/register`
- Dashboard (remote): `/dashboard`

Each remote also runs standalone on its own port (useful for team-local development).

## Auth API (later)

UI forms call `authClient` in `packages/auth/src/api/authClient.ts`. Types live in `packages/contracts`. Replace the stub with real `fetch` calls when your backend is ready.

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

Same ports: shell `3000`, auth `3001`, dashboard `3002`.

## Layout

```
packages/
  shell/          # host
  auth/           # remote
  dashboard/      # remote
  contracts/      # shared types
  webpack-shared/ # shared MF devServer + shared deps config
docker/
  Dockerfile.*
```

## Routing model

The shell defines top-level routes and lazy-loads each remote. Each remote owns **sub-routes** under its mount path (`remote-mount` pattern).