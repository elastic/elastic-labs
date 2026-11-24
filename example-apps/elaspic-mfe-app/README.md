# Elaspic

Elaspic is a photo gallery you run in the browser after signing in. You register with a username, email, and password, then upload JPEG, PNG, or WebP images (up to 5 MB each). Your pictures appear as a thumbnail grid; opening one shows the full image and a comment thread where you can add, edit, or delete your own comments.

From the **Users** section you can browse other registered accounts and view their public galleries the same way—thumbnails, detail view, and comments—without changing their photos. Authentication uses bearer tokens; the React UI talks to a Node.js Express API backed by MySQL, with nginx as the single public entrypoint.

Stack and routing details: [PROJECT.md](./PROJECT.md). Per-service docs: [api](./api/README.md), [ui](./ui/README.md).

## Repository layout

| Path | Role |
| --- | --- |
| `api/` | Express API ([README](./api/README.md)) |
| `ui/` | React SPA ([README](./ui/README.md)) |
| `nginx/` | Public reverse proxy ([README](./nginx/README.md)) |
| `database/` | MySQL init DDL ([README](./database/README.md)) |
| `docker-compose.yml` | Full stack orchestration |

## Prerequisites

- Docker with Compose v2
- (Optional) Node.js 22 for local API/UI development

## Setup and run with Docker Compose

1. **Copy environment file**

   ```bash
   cd examples/elaspic
   cp .env.example .env
   ```

2. **Edit `.env`** — set at minimum:

   - `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD`
   - For telemetry export via `/collect/`, set `OTEL_EXPORTER_OTLP_ENDPOINT` and `ELASTIC_OTEL_API_KEY` (placeholders in `.env.example` are enough to start the stack locally)

3. **Build and start**

   ```bash
   docker compose up --build
   ```

4. **Open the app**

   - UI: [http://localhost:8080](http://localhost:8080) (or the host port from `NGINX_HTTP_PORT`)
   - API health via proxy: [http://localhost:8080/api/health](http://localhost:8080/api/health)

5. **Register** a user at `/register`, then sign in, upload pictures with **Add** on `/pics`, and browse **Users**.

## Stop

```bash
docker compose down
```

To remove the MySQL volume as well:

```bash
docker compose down -v
```

## Service architecture

```text
Browser :8080
    │
    ▼
 nginx (strip /api, /collect proxy, UI)
    ├──► ui:80        (static SPA)
    ├──► api:3000     (Express)
    └──► OTLP host    (/collect/)
              │
              ▼
         database:3306 (MySQL 8)
```

Stack versions: **Node 22**, **MySQL 8**, **nginx 1.27** (see `PROJECT.md`).

**nginx behavior (summary):**

- `/api/` — proxied to the API after **stripping** `/api` (e.g. `/api/pics` → upstream `/pics`). Details: [nginx/README.md](./nginx/README.md).
- `/collect/` — forwards to `OTEL_EXPORTER_OTLP_ENDPOINT` with `Authorization: ELASTIC_OTEL_API_KEY`; sets `Host`, `X-Forwarded-For`, and `X-Real-IP`. **In scope for v1** in the shipped compose stack.
- All other paths — UI static files; deep links use `try_files` / `index.html`.

### Runtime versions

| Component | Version |
| --- | --- |
| Node.js (API build & runtime) | **22** |
| MySQL | **8** |
| nginx | **1.27** |

### Database

Database name: `elaspic`. Charset: `utf8mb4`. IDs are UUID v4 (`CHAR(36)`). Timestamps: `DATETIME(3)` in MySQL; the API serializes ISO 8601.

**Source of truth for DDL:** `database/init/01-schema.sql` (applied on first MySQL container start). Table/column semantics and JSON shapes: [api/README.md](./api/README.md#persistence-models).

## Environment variables

Configuration is supplied through `docker-compose` (optional `.env` referenced by compose). Names below are **canonical** for this project.

| Variable | Service(s) | Required | Default | Purpose |
| --- | --- | --- | --- | --- |
| `MYSQL_ROOT_PASSWORD` | database | yes | — | MySQL root password (dev compose only if root used) |
| `MYSQL_DATABASE` | database | yes | `elaspic` | Database created on first start |
| `MYSQL_USER` | database, api | yes | — | Application DB user |
| `MYSQL_PASSWORD` | database, api | yes | — | Password for `MYSQL_USER` |
| `MYSQL_HOST` | api | yes | `database` | Docker network hostname of MySQL |
| `MYSQL_PORT` | api | no | `3306` | MySQL port |
| `API_PORT` | api | no | `3000` | Express listen port (internal) |
| `SESSION_TTL_SECONDS` | api | no | `86400` | Opaque session lifetime (24h) |
| `BCRYPT_ROUNDS` | api | no | `12` | Password hashing cost |
| `MAX_UPLOAD_BYTES` | api | no | `5242880` | Multipart upload cap (5 MB) |
| `THUMBNAIL_MAX_EDGE_PX` | api | no | `320` | Longest edge for generated thumbnails |
| `THUMBNAIL_JPEG_QUALITY` | api | no | `80` | JPEG/WebP thumbnail quality (1–100) |
| `NGINX_HTTP_PORT` | nginx | no | `8080` | Host port exposed to browsers |
| `UI_UPSTREAM` | nginx | no | `ui:80` | Internal UI service address |
| `API_UPSTREAM` | nginx | no | `api:3000` | Internal API upstream |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | nginx | yes* | — | OTLP/collector URL for `/collect/` proxy |
| `ELASTIC_OTEL_API_KEY` | nginx | yes* | — | Value sent as `Authorization` on proxied OTLP requests |
| `PUBLIC_API_PREFIX` | ui (build) | no | `/api` | Browser-relative API base (via nginx) |

\*Required when telemetry export is enabled; compose may ship placeholders for local dev.

Service-specific notes: [api/README.md](./api/README.md#configuration), [ui/README.md](./ui/README.md#configuration).

**Health checks:** `GET /api/health` through nginx or `GET /health` on the API container directly should return `200` when the API process is up.