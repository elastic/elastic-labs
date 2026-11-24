# Elaspic edge proxy (nginx)

nginx **1.27** is the only public entrypoint for the stack. It routes traffic by path prefix:

| Path | Behavior |
| --- | --- |
| `/api/*` | Reverse proxy to the API service; **strips** the `/api` prefix (`/api/pics` → `http://api:3000/pics`) |
| `/collect/*` | Forwards to `OTEL_EXPORTER_OTLP_ENDPOINT` with `Authorization: ELASTIC_OTEL_API_KEY` |
| everything else | Proxies to the UI static server (SPA) |

Configuration is generated at container start from `nginx.conf.template` via `envsubst` (`entrypoint.sh`).

## Environment

See root `README.md` and `PROJECT.md` for `API_UPSTREAM`, `UI_UPSTREAM`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ELASTIC_OTEL_API_KEY`, and `NGINX_HTTP_PORT`.
