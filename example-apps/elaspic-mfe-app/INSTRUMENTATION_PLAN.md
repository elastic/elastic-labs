# Elaspic UI instrumentation plan (multi-team microfrontends)

This document describes how to instrument the Elaspic React SPA so each microfrontend team can own its telemetry and **filter observability data by the team responsible for the code**, without splitting the app into multiple browser SDK instances or duplicate RUM agents.

## Goals

| Goal | Notes |
| --- | --- |
| One export path for the whole SPA | Reuse nginx `/collect/` → OTLP (see [README](./README.md)) |
| Team-scoped signal | Dashboards, alerts, and Discover queries can isolate a team's noise |
| Minimal coupling | MFE teams do not configure exporters, API keys, or sampling |
| End-to-end traces (later) | Browser `fetch` spans join API traces when the backend is instrumented |
| Safe defaults | No secrets in the bundle; session sampling limits volume |

### Non-goals (v1)

- Separate deployables or `service.name` per microfrontend (incompatible with a single page and one RUM SDK instance)
- Per-team OTLP endpoints or API keys in the browser
- Full ownership attribution for **automatic** telemetry (navigation timing, web vitals, shell chrome) without platform hooks

## Current state

| Area | Status |
| --- | --- |
| UI telemetry | **Not instrumented** (`ui/src/main.jsx` boots React only) |
| Export infrastructure | **Ready** — edge nginx proxies `/collect/` to `OTEL_EXPORTER_OTLP_ENDPOINT` with `ELASTIC_OTEL_API_KEY` ([nginx.conf.template](./nginx/nginx.conf.template)) |
| API telemetry | **Not instrumented** — Express has no OpenTelemetry (optional phase 2) |
| CORS on `/collect/` | **Likely required** — template forwards OTLP but does not define CORS; add per [EDOT proxy/CORS guidance](../../../docs/reference/edot-browser/proxy-cors.md) when export is enabled |

## Application architecture (relevant to ownership)

The UI is a **single Vite build** served as one SPA. Team boundaries are **route-owned modules** under `ui/src/microfrontends/`, lazy-loaded from `App.jsx`.

```text
Platform / shell team (suggested)
  main.jsx, App.jsx, shell/, auth/AuthContext.jsx, api/client.js
  pages/ErrorPageRoute.jsx, shared components/ (except team-specific usage)

Identity team
  microfrontends/login/
  microfrontends/register/

Pics team
  microfrontends/pics/

Users team
  microfrontends/users/

Shared UI (attribute by active route context, not by folder alone)
  components/CommentPanel.jsx  (used from pics and users detail views)
```

Routing map (primary key for “which team owns this screen”):

| Route prefix | Module | Suggested `elaspic.ui.team` |
| --- | --- | --- |
| `/login` | `login/` | `identity` |
| `/register` | `register/` | `identity` |
| `/pics` | `pics/` | `pics` |
| `/users` | `users/` | `users` |
| Shell chrome, `/error/*`, auth gate | `shell/`, `auth/` | `platform` |

## Recommended stack: `@elastic/opentelemetry-browser` (EDOT Browser)

Use the in-repo package [`@elastic/opentelemetry-browser`](../../../packages/opentelemetry-browser/README.md) (or the same package from npm). It wraps the [OpenTelemetry Browser SDK](https://github.com/open-telemetry/opentelemetry-browser) with `startBrowserSdk`, session management, and default RUM instrumentations aligned with Elastic Observability.

**Why one SDK for the whole app**

- EDOT Browser is designed for a **single** `startBrowserSdk()` per page; multiple agents cause duplicate or conflicting instrumentation ([setup docs](../../../docs/reference/edot-browser/setup.md)).
- `service.name` is a **resource** attribute (one logical frontend service in APM Service Inventory). Team separation should be a **dimension on spans and logs**, not separate services.

**Alternative (platform team only)**

Teams that need low-level control (custom `SpanProcessor`, composing instrumentations manually) can use upstream `@opentelemetry/browser-sdk` and `@opentelemetry/browser-instrumentation` directly. That path shifts more burden to the platform team and should still follow the same **attribute contract** in this document so filtering stays consistent.

## Team attribution model

### Canonical attributes

Use stable, low-cardinality attributes on every team-emitted span and log record:

| Attribute | Example | Purpose |
| --- | --- | --- |
| `elaspic.ui.team` | `pics` | **Primary filter** for team dashboards |
| `elaspic.ui.microfrontend` | `pics` | Module id (same as team where 1:1) |
| `elaspic.ui.route` | `/pics/:picId` | React Router pattern (not raw `picId` value) |
| `elaspic.ui.feature` | `upload`, `comments` | Optional sub-feature inside an MFE |

Resource-level (set once at SDK init by platform team):

| Attribute | Example |
| --- | --- |
| `service.name` | `elaspic-ui` |
| `service.version` | CI build / `package.json` version |
| `deployment.environment.name` | `development` / `production` |

Instrumentation scope name (set per team when using the Traces/Logs API):

| Pattern | Example |
| --- | --- |
| `io.elaspic.ui.<team>` | `io.elaspic.ui.pics` — appears as scope / library name in exported OTLP |

Do **not** put usernames, tokens, email, or picture ids in telemetry attributes (PII and cardinality).

### What gets team labels automatically vs manually

| Signal | Default without extra work | How to add `elaspic.ui.team` |
| --- | --- | --- |
| `documentLoad` span | Whole app | Resource only; accept as platform-level |
| `external.http` spans (`fetch` via `api/client.js`) | All API calls | **Platform:** route-scoped context (below) + optional wrapper span around `apiFetch` |
| `browser.navigation` logs (SPA) | URL path | Filter by path prefix; enrich with platform hook |
| `browser.user_action.click` | DOM target | Weak team signal; prefer route context + custom business logs |
| Errors in MFE code | `exception` logs | **MFE:** Error Boundary emits log with `elaspic.ui.team` |
| Custom business events | — | **MFE:** Logs API (preferred) or short custom spans |

Automatic RUM events will not all carry `elaspic.ui.team` unless the platform propagates **active context** from the current route into child spans/logs (see `MicrofrontendTelemetryProvider`).

## Platform team deliverables

The platform team owns **one** shared telemetry module and wires it before React renders.

### 1. Install and initialize EDOT (first import in `main.jsx`)

Initialize **before** `createRoot` / other imports that touch `fetch` or `document` ([install-agent](../../../docs/reference/edot-browser/install-agent.md)).

```js
import { startBrowserSdk } from '@elastic/opentelemetry-browser';

const isTelemetryEnabled =
  import.meta.env.VITE_OTEL_ENABLED !== 'false';

if (isTelemetryEnabled) {
  startBrowserSdk({
    serviceName: 'elaspic-ui',
    serviceVersion: import.meta.env.VITE_APP_VERSION ?? 'dev',
    logLevel: import.meta.env.DEV ? 'info' : 'warn',
    resourceAttributes: {
      'deployment.environment.name':
        import.meta.env.VITE_DEPLOYMENT_ENV ?? 'development',
    },
    exportConfig: {
      // Same origin; nginx terminates auth at /collect/
      url: `${window.location.origin}/collect`,
    },
    session: {
      sampleRate: Number(import.meta.env.VITE_OTEL_SESSION_SAMPLE_RATE ?? 1),
    },
    ignoreFetchUrls: [/\/collect\//],
  });
}
```

**Monorepo dependency:** From `examples/elaspic/ui`, depend on `@elastic/opentelemetry-browser` via npm or `file:../../../packages/opentelemetry-browser`. Run `npm run build` in that package before UI builds that consume `lib/`.

**Build-time env (Vite):** Document `VITE_OTEL_ENABLED`, `VITE_DEPLOYMENT_ENV`, `VITE_APP_VERSION`, `VITE_OTEL_SESSION_SAMPLE_RATE` in compose/Dockerfile args as needed (no secrets).

### 2. Shared telemetry SDK for MFE teams (`ui/src/telemetry/`)

Provide a thin wrapper so teams never import exporter details:

- `getTeamLogger(team, name)` — OpenTelemetry Logs API with `elaspic.ui.team` on every record
- `getTeamTracer(team)` — `trace.getTracer('io.elaspic.ui.' + team, version)`
- `withTeamContext(team, routePattern, fn)` — runs callback under `context.with` carrying team baggage/values used by wrappers
- `recordUiEvent({ team, event, attributes })` — standard shape for business logs

Export TypeScript/JSDoc typedefs and **copy-paste examples** per team.

### 3. Route-scoped context (`MicrofrontendTelemetryProvider`)

Wrap microfrontend route elements in `App.jsx` (inside `Lazy` / `RequireAuth`) so that when a module is active:

1. Resolve `team` + `routePattern` from React Router (`useLocation`, `useParams` with **pattern** ids, not UUID values).
2. Store team in **OpenTelemetry context** (and optionally [W3C Baggage](https://w3c.github.io/baggage/) for propagation to downstream HTTP when the backend supports it).
3. On route change, emit one structured log: `elaspic.ui.route_enter` with `elaspic.ui.team` and `elaspic.ui.route`.

Optional: start a **route lifecycle span** `ui.route` for the lifetime of the route (ended on unmount). Child `external.http` spans may parent correctly when context is active (EDOT AsyncApis context manager; note async/await limitations in [telemetry docs](../../../docs/reference/edot-browser/telemetry.md)).

**Mapping implementation sketch**

```js
const TEAM_BY_PATH_PREFIX = [
  { prefix: '/login', team: 'identity', microfrontend: 'login' },
  { prefix: '/register', team: 'identity', microfrontend: 'register' },
  { prefix: '/pics', team: 'pics', microfrontend: 'pics' },
  { prefix: '/users', team: 'users', microfrontend: 'users' },
];
// default: platform
```

### 4. Optional: attribute API traffic to the active team

`ui/src/api/client.js` is shared. Wrap `apiFetch` so that when a team context is active, each request:

- Adds attributes on a short client span `elaspic.api.client` **or**
- Emits a debug log with `http.route` + `elaspic.ui.team`

Keep `fetch` as the transport so EDOT `external.http` spans still capture timing and trace propagation headers for a future instrumented API.

### 5. Logout and sessions

On successful logout (`AuthContext`), call `endSession()` from the object returned by `startBrowserSdk` so identity/session analytics do not bleed into the next user on a shared machine ([session API](../../../docs/reference/edot-browser/configuration.md)).

### 6. Edge proxy hardening

- Add CORS (and `OPTIONS`) for `/collect/` on the same origin as the UI, or keep export same-origin only (recommended).
- Confirm OTLP paths: exporter uses `exportConfig.url` + `/v1/traces` and `/v1/logs`; nginx `proxy_pass` must preserve paths expected by the collector.
- Document that **API keys stay on nginx**, never in `exportConfig.headers` in the browser.

## Microfrontend team deliverables

Each team instruments **only its folder** using the shared telemetry module.

### Required (all teams)

1. **Root layout wrapper** in the MFE entry (`*Routes.jsx` or top page): mount inside platform `MicrofrontendTelemetryProvider` or call `useMicrofrontendTeam('pics')` once.
2. **Error boundary** (React): on `componentDidCatch`, `recordUiEvent` / logger with `severity: ERROR`, `elaspic.ui.team`, `exception.message`, `exception.stack` (truncate stack in production if needed).
3. **Business events** for key user journeys (Logs API preferred):

| Team | Suggested events (`elaspic.ui.feature` or `event.name`) |
| --- | --- |
| identity | `auth.login.success`, `auth.login.failure`, `auth.register.success` |
| pics | `pics.upload.started`, `pics.upload.success`, `pics.upload.validation_error` |
| users | `users.list.loaded`, `users.gallery.opened` |

Do not log passwords or tokens.

### Optional (high value)

- Short spans around multi-step UI work (e.g. upload pipeline: validate → POST → refresh grid).
- `picId` only as a span attribute if required for debugging — prefer correlating via `trace.id` in support workflows; avoid high-cardinality dashboards keyed on id.

### Shared `CommentPanel`

Attribute comments to the **active route team** (pics vs users) via context from the parent screen, not the component file owner.

## Phased rollout

| Phase | Owner | Work | Verification |
| --- | --- | --- | --- |
| **0** | Platform | CORS/same-origin `/collect/`, env for export | Browser network tab shows `204/200` on `/collect/v1/traces` and `/v1/logs` |
| **1** | Platform | `startBrowserSdk`, `ignoreFetchUrls`, session config | Service `elaspic-ui` in APM; `documentLoad`, `external.http` on `/api/*` |
| **2** | Platform | `telemetry/` helpers + `MicrofrontendTelemetryProvider` | Discover: `elaspic.ui.team : pics` on route_enter logs |
| **3** | Identity | Login/register events + error boundary | Filter errors and auth logs by `identity` |
| **4** | Pics / Users | Upload/gallery events + boundaries | Team dashboards per table below |
| **5** | Platform + API | Backend OpenTelemetry + trace context | Single trace: browser `external.http` + API spans |

## Filtering in Elastic Observability

Examples (Discover / unified logs; adjust field names to your data view):

```kql
service.name : "elaspic-ui" and elaspic.ui.team : "pics"
```

```kql
service.name : "elaspic-ui" and event.dataset : "browser.navigation" and url.path : "/pics*"
```

```kql
service.name : "elaspic-ui" and event.name : "exception" and elaspic.ui.team : "users"
```

```kql
trace.id : "<id>" and service.name : "elaspic-ui"
```

**Suggested per-team views**

| Team | Primary filter | Secondary (automatic RUM) |
| --- | --- | --- |
| pics | `elaspic.ui.team : pics` | `url.path : /pics*` on navigation logs |
| users | `elaspic.ui.team : users` | `url.path : /users*` |
| identity | `elaspic.ui.team : identity` | `url.path : /login* or /register*` |
| platform | `elaspic.ui.team : platform` OR missing team on shell-only paths | Session / web vitals without team |

Install the [RUM OpenTelemetry Assets](https://github.com/elastic/integrations/tree/main/packages/otel_rum_dashboards) integration for OTel RUM dashboards ([setup note](../../../docs/reference/edot-browser/setup.md)).

## Sampling and volume

- Use **`session.sampleRate`** (not per-team) at platform level; teams share one sampling decision per session ([sessions](../../../docs/reference/edot-browser/telemetry.md#sessions)).
- Lower rate in production (e.g. `0.2`) once verified; document that unsampled sessions export nothing.
- Business **error** logs should remain actionable at sampled rates; for rare critical failures, consider always-on error reporting patterns that still respect PII rules.

## Future: API instrumentation (phase 5)

Instrument `api/` with EDOT Node or OpenTelemetry Express middleware:

- Propagate W3C `traceparent` from browser `fetch` (EDOT default) into API spans.
- Add `service.name: elaspic-api` — distinct from UI; join in trace view by `trace.id`.
- Optionally read a **baggage** header `elaspic.ui.team` (if platform enables propagation) for backend spans — never trust without auth, use only for observability tagging.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| React StrictMode double mount in dev | Document duplicate route_enter logs locally; use idempotent events or dev-only dedupe |
| `async/await` loses trace context | Prefer `.then` in hot paths or wrap with `withTeamContext`; see EDOT context manager limits |
| Teams import `@elastic/opentelemetry-browser` directly | Lint rule / CODEOWNERS: only `telemetry/` and `main.jsx` may import EDOT |
| High cardinality on `picId` / `userId` | Use route patterns; restrict ids to trace support, not dashboard keys |
| Shared `fetch` spans without team | Platform route context + optional `apiFetch` wrapper span |
| OTLP blocked by CSP | Add `connect-src` for same-origin `/collect` |

## Governance

- **Attribute contract** (`elaspic.ui.*`) is versioned in this file; breaking changes require platform announcement.
- **CODEOWNERS** per `ui/src/microfrontends/<name>/` aligns review with team ownership.
- **No second RUM agent** (legacy Elastic APM RUM, duplicate OTel SDK) on the same page.

## Summary

1. **Platform** installs one EDOT Browser SDK, exports to `/collect/`, and exposes a small telemetry API.
2. **Teams** tag their logs/spans with `elaspic.ui.team` and scope `io.elaspic.ui.<team>`.
3. **Route context** attributes shared `fetch` and navigation activity to the owning team well enough to separate signal from noise in Discover and alerts.
4. **Backend** instrumentation completes end-to-end traces without changing the team filtering model on the UI side.