# EDOT Browser instrumentation plan (Module Federation)

This plan instruments the **shell host** with [EDOT Browser using the prebuilt bundle](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/browser/install-agent#install-bundle), while giving each team a stable **`team.name` attribute** on spans and log records produced from their microfrontend’s code paths. Shared plumbing lives in a new workspace package **`@mfe/telemetry`** (platform/shell ownership).

## Decisions (confirmed)

| Topic | Decision |
| --- | --- |
| Team filter attribute | **`team.name`** on spans and log records (not only resource attributes) |
| Shared runtime helpers | New **`@mfe/telemetry`** package (not `@mfe/contracts`) |
| Standalone remotes (ports 3001–3003) | **No** browser telemetry; EDOT runs only when the app is served through the shell |
| Bundle delivery | **Self-host** a **committed local copy** of `elastic-otel-browser.min.js` (no npm dependency on EDOT); platform devs **manually** replace the file when upgrading |

## Architecture constraints

- **One browser tab, one SDK.** `startBrowserSdk` is single-shot for the page. The shell loads EDOT once; remotes must not call it again.
- **Module Federation** runs auth, dashboard, and photo in the same JS realm as the shell. Automatic instrumentation (fetch, clicks, navigation logs, and so on) follows **OpenTelemetry context** across async work when the [EDOT async context manager](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/browser/telemetry#traces-context-manager) is active.
- **`resourceAttributes` alone are insufficient** for per-team filtering: they apply to the whole RUM service. Team isolation requires **span/log record attributes** derived from active context at emit time.
- **`startBrowserSdk` (bundle)** does not accept custom `processors` in its public config, but after it runs the global `LoggerProvider` / `TracerProvider` are real SDK instances. **`@mfe/telemetry`** registers **team processors** on those providers immediately after init (see §1.2.1). This matches upstream guidance: use a **`LogRecordProcessor`** for logs ([instrumentation docs](https://github.com/open-telemetry/opentelemetry-browser/tree/main/packages/instrumentation)), not per-instrumentation `applyCustomLogRecordData` (deprecated and **not supported** on navigation-timing, resource-timing, long-animation-frame, and others).
- Per-team attribution still depends on **active OpenTelemetry context** (`runWithTeam` / `MicrofrontendBoundary`) so processors can read the current team at span start / log emit time.

```
┌─────────────────────────────────────────────────────────────────┐
│  shell index.html (only place that loads EDOT bundle)          │
│    elastic-otel-browser.min.js → startBrowserSdk({ ... })      │
│    mfe-telemetry-processors.iife.js → installTeamProcessors()  │
│    (TeamSpanProcessor + TeamLogRecordProcessor)                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  @mfe/shell                                                     │
│    MicrofrontendBoundary team.name=platform-shell               │
│    lazy remotes wrapped with team-specific boundaries           │
└────────────────────────────┬────────────────────────────────────┘
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   @mfe/auth           @mfe/dashboard        @mfe/photo
   boundary in App      boundary in App       boundary in App
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                    @mfe/contracts (types only)
                    no team attribution here
```

## Team registry

Define canonical values in `@mfe/telemetry` (single source of truth for Kibana filters and code):

| Package | Suggested `team.name` | Notes |
| --- | --- | --- |
| `@mfe/shell` | `platform-shell` | Host layout, routing, remote loading |
| `@mfe/auth` | `identity` | Replace with your org’s identity team id |
| `@mfe/dashboard` | `gallery` | Photo list experience |
| `@mfe/photo` | `media-detail` | Photo detail + comments |

Export `TEAM_NAME` constants per app from `@mfe/telemetry` (or per-app re-exports) so teams do not hardcode strings.

## Execution roadmap (verifiable steps)

Implement and **stop after each step** to verify before continuing. Later steps build on earlier ones.

**Verification tooling (pick what you have):**

| Level | Use when |
| --- | --- |
| **A — Browser only** | No collector yet; validate load, SDK, and export *attempts* |
| **B — Local OTLP** | Collector or gateway on `localhost:4318` (or your proxy) receives payloads |
| **C — Elastic** | Full RUM in Kibana / Discover |

---

### Step 0 — Baseline (no instrumentation)

**Do:** `npm install`, `npm run dev`, open [http://localhost:3000](http://localhost:3000).

**Verify:**

- [ ] App works: home, `/auth/login`, `/dashboard`, photo detail.
- [ ] Shell `index.html` has **no** EDOT scripts yet (baseline for regressions).

---

### Step 1 — Vendor EDOT file is served

**Do:**

- Add `packages/shell/public/vendor/elastic-otel-browser.min.js` (+ `EDOT_BROWSER_VERSION`).
- Ensure webpack serves `public/vendor/` in dev and production (add `copy-webpack-plugin` from `public/vendor` → `dist/vendor` if your build does not copy it today).

**Verify (A):**

- [ ] `curl -sI http://localhost:3000/vendor/elastic-otel-browser.min.js` → `200`.
- [ ] In DevTools Console on `/`: `typeof startBrowserSdk === 'function'`.

**Do not** call `startBrowserSdk` yet — only load the script in `index.html` for this step if you want an even smaller increment:

```html
<script src="/vendor/elastic-otel-browser.min.js" crossorigin></script>
```

---

### Step 2 — EDOT starts (no export backend required yet)

**Do:** Add inline `startBrowserSdk({ … })` per §1.2 with:

- `logLevel: 'debug'`
- `exportConfig.url` pointing at your proxy **or** a deliberate invalid URL you control for this step (exports will fail; SDK should still run)

**Verify (A):**

- [ ] No red errors in console; EDOT diagnostic lines appear at `debug` level.
- [ ] `globalThis.__EDOT_SDK__` is an object with `getSession`, `observe`, `endSession`.
- [ ] After the app chunk loads, from any MFE that imports `@opentelemetry/api`: `trace.getTracerProvider().getTracer('test').startSpan('ping').end()` does not throw (SDK is active; the EDOT bundle does not expose `trace` on `window`).

**Verify (B)** — optional:

- [ ] DevTools → Network: `POST` to `…/v1/traces` or `…/v1/logs` (may be `4xx` until Step 3).

---

### Step 3 — OTLP export path works

**Do:** Run reverse proxy or local OTLP HTTP endpoint per §1.3; set real `exportConfig.url`; fix CORS on the proxy for `http://localhost:3000`.

**Verify (B):**

- [ ] Network: `POST` to export URL returns **2xx** (not blocked by CORS).
- [ ] Collector logs or proxy access log show incoming OTLP bodies.

**Verify (C)** — optional:

- [ ] Service **`photo-service-web`** appears in Elastic; at least one trace or log record within a few minutes of browsing.

At this step **`team.name` is not required** — you are proving plumbing only.

---

### Step 4 — `@mfe/telemetry` context (no processors)

**Do:**

- Create `packages/telemetry` workspace `@mfe/telemetry` with `TEAM_NAMES`, `runWithTeam`, `getActiveTeamName`, `installTelemetryBridge()`.
- Add `@opentelemetry/api` as federation shared singleton (§2.1).
- Import `installTelemetryBridge()` first in `packages/shell/src/index.tsx`.

**Verify (A):**

- [ ] In console after app loads: `globalThis.__MFE_TELEMETRY__.getTeamName()` returns `'platform-shell'` by default.
- [ ] Temporary debug snippet in shell (remove before merge): `runWithTeam('identity', () => console.log(getActiveTeamName()))` prints `identity`.
- [ ] `npm run build` still succeeds for shell and one remote.

---

### Step 5 — Team processors + IIFE

**Do:**

- Implement `installTeamProcessors()`, `TeamSpanProcessor`, `TeamLogRecordProcessor` (§1.2.1).
- Build `mfe-telemetry-processors.iife.js` into `public/vendor/`; wire HTML scripts after `startBrowserSdk`.

**Verify (A):**

- [ ] `globalThis.__MFE_TELEMETRY_INSTALL__.installTeamProcessors()` runs without throwing (or call once in console before/after navigation).
- [ ] Add temporary `logLevel: 'verbose'` and confirm no processor registration warnings.

**Verify (B/C):**

- [ ] Export payload (collector or Elastic JSON): spans and/or logs include **`team.name`: `platform-shell`** for home page activity (fallback before boundaries).
- [ ] At least one **`external.http`** span and one log signal (e.g. navigation or user-action after a click) contain the attribute.

---

### Step 6 — Shell layout team context

**Do:**

- Implement `MicrofrontendBoundary`.
- Wrap shell-owned UI (layout, home) with `TEAM_NAMES.platformShell` (or equivalent).

**Verify (B/C):**

- [ ] On `/` only: new telemetry keeps `team.name: platform-shell`.
- [ ] Click nav link: user-action / navigation logs still `platform-shell` until a remote mounts.

---

### Step 7 — Shell wraps federated remotes

**Do:** In `packages/shell/src/App.tsx`, wrap each lazy remote route in `MicrofrontendBoundary` with the correct `TEAM_NAMES.*`.

**Verify (C):**

| Route | Action | Expected `team.name` |
| --- | --- | --- |
| `/auth/login` | Focus field, failed login | `identity` on fetch span to API |
| `/dashboard` | Load gallery | `gallery` on photo list fetch |
| `/photo/:id` | Open detail, add comment | `media-detail` on relevant fetches |

- [ ] Elastic/Kibana filter `team.name : "identity"` shows **no** dashboard-only traffic after you only visited auth (noise isolation spot check).

---

### Step 8 — Remote-owned boundaries

**Do:** Each remote wraps its `App` root (§2.3); add `@mfe/telemetry` dependency per package.

**Verify (C):**

- [ ] Same table as Step 7 still passes if shell wrapper is temporarily removed locally (proves remote boundary).
- [ ] Opening the same route twice does not duplicate or drop attributes.

---

### Step 9 — Session end on logout (optional but recommended)

**Do:** Auth logout calls `globalThis.__EDOT_SDK__?.endSession?.()`.

**Verify (A/C):**

- [ ] After logout, next login gets a new `session.id` in exported telemetry (compare two sessions in Discover).

---

### Step 10 — Production-shaped build

**Do:** `npm run build -w @mfe/shell`, serve `dist/`, set `PUBLIC_PATH` / remote URLs as in README.

**Verify:**

- [ ] `dist/vendor/elastic-otel-browser.min.js` exists and loads.
- [ ] Steps 2–3 checks pass against the built artifact, not only dev server.

---

### Step 11 — Team rollout (parallel)

**Do:** Phase 3 checklist per team; document Kibana saved searches.

**Verify (C):**

- [ ] Each team validates only their filter in a shared Elastic space.
- [ ] Standalone remotes on 3001–3003: confirm **no** OTLP traffic when opened directly (per decision).

---

## Phase 1 — Platform: shell EDOT bootstrap

### 1.1 Local EDOT bundle (no npm)

EDOT is **not** installed via `npm install @elastic/opentelemetry-browser`. The shell serves a **checked-in** file from the repo; platform developers own updating it.

**Layout**

```
packages/shell/public/vendor/
  elastic-otel-browser.min.js   # committed artifact (global startBrowserSdk)
  EDOT_BROWSER_VERSION          # single line, e.g. 1.0.0 — update when replacing the .js
  README.md                     # short upgrade steps (optional but recommended)
```

**Initial add (one-time per upgrade)**

1. Download the minified build for the target release from [npm `@elastic/opentelemetry-browser`](https://www.npmjs.com/package/@elastic/opentelemetry-browser) (`build/elastic-otel-browser.min.js`) or from the [EDOT Browser release notes](https://www.elastic.co/docs/release-notes/edot/sdks/rum). Do not use an unpinned `@latest` URL in production HTML.
2. Replace `packages/shell/public/vendor/elastic-otel-browser.min.js` and set `EDOT_BROWSER_VERSION` to match.
3. Run shell smoke tests (§Phase 4) and re-verify `installTeamProcessors()` against the new bundle (§1.2.1 — processor registration is sensitive to EDOT/OTel internals).
4. Commit the vendor files in the same PR; note the version in the PR description.

**Runtime**

- Reference only the **repo path**, e.g. `/vendor/elastic-otel-browser.min.js`, in `packages/shell/public/index.html`, in `<head>`, **before** the webpack entry (synchronous load preferred for first paint / document load; async is acceptable only if you accept early-request blind spots per [EDOT docs](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/browser/install-agent#install-bundle)).
- Webpack `devServer` and production builds must serve `public/vendor/` as static files (default `HtmlWebpackPlugin` + `public/` behavior).

**Optional integrity**

- Add `crossorigin` on the `<script>` tag if you serve the file from the same origin (already in §1.2).
- Optionally record a Subresource Integrity hash in a comment in `index.html` when you replace the file (manual update alongside the script).

**Out of scope**

- No `prebuild` copy from `node_modules`, no workspace dependency on `@elastic/opentelemetry-browser`.
- `@mfe/telemetry` may still depend on **`@opentelemetry/api`** only (for context + processor install); that is separate from the EDOT distribution bundle.

### 1.2 `startBrowserSdk` configuration (shell-only)

Keep the init **free of `instrumentations` overrides** (no per-instrumentation hooks). EDOT enables its default instrumentations; team attributes are added centrally by processors (§1.2.1).

```html
<script src="/vendor/elastic-otel-browser.min.js" crossorigin></script>
<script>
  // Fallback until the webpack bundle calls installTelemetryBridge() from @mfe/telemetry.
  globalThis.__MFE_TELEMETRY__ = {
    getTeamName: () => 'platform-shell',
    teamAttributeKey: 'team.name',
  };

  globalThis.__EDOT_SDK__ = startBrowserSdk({
    serviceName: 'photo-service-web',
    serviceVersion: '__BUILD_VERSION__',
    logLevel: 'info',
    resourceAttributes: {
      'deployment.environment.name': '__ENV__',
    },
    exportConfig: {
      url: '__OTEL_PROXY_URL__',
    },
    ignoreFetchUrls: [
      /\/remoteEntry\.js(\?|$)/,
      /\/v1\/(traces|logs)(\?|$)/,
    ],
  });
</script>
<script src="/vendor/mfe-telemetry-processors.iife.js"></script>
<script>
  // Synchronous — must run before idle/resource-timing batches and before the app chunk.
  globalThis.__MFE_TELEMETRY_INSTALL__?.installTeamProcessors();
</script>
```

Operational notes:

- Use one **`serviceName`** for the whole product in Elastic (`photo-service-web` above); teams filter on **`team.name`**, not separate services.
- Inject `exportConfig.url` from server template or webpack `DefinePlugin` (reverse proxy base URL only — no `/v1/traces` suffix).
- Extend `ignoreFetchUrls` for analytics and health checks as needed.
- Store `startBrowserSdk`’s return value on `globalThis.__EDOT_SDK__` so auth can call `endSession()` on logout.

### 1.2.1 Team processors (all logs and spans)

**Why not `applyCustomLogRecordData`?** Only some log instrumentations expose that hook (for example user-action, navigation, web-vitals). **Navigation timing, resource timing, long animation frames, and others do not.** Upstream marks the hook deprecated and points to a **`LogRecordProcessor`** instead.

**Approach:** `@mfe/telemetry` builds a small **IIFE** (`mfe-telemetry-processors.iife.js`, vendored next to the EDOT bundle) that runs in the inline block above. It implements:

| Processor | When | What |
| --- | --- | --- |
| `TeamLogRecordProcessor` | `onEmit(logRecord, ctx)` | `logRecord.setAttributes({ 'team.name': resolveTeam(ctx) })` |
| `TeamSpanProcessor` | `onStart(span, parentContext)` | `span.setAttributes({ 'team.name': resolveTeam(parentContext) })` |

`resolveTeam(ctx)` reads the team from the **OpenTelemetry context** (same key as `runWithTeam`). If missing, fall back to `globalThis.__MFE_TELEMETRY__.getTeamName()` (defaults to `platform-shell` for early page telemetry).

**Registration** happens against the globals EDOT just installed:

- `logs.getLoggerProvider()` → insert `TeamLogRecordProcessor` **after** EDOT’s `SessionLogRecordProcessor` and **before** the OTLP `BatchLogRecordProcessor` (same ordering rule EDOT uses for session attributes).
- `trace.getTracerProvider()` → insert `TeamSpanProcessor` **after** `SessionSpanProcessor` and **before** the export/batch processor.

OpenTelemetry JS 3.x constructs processor lists in the provider constructor and does not expose `addLogRecordProcessor` / `addSpanProcessor`. The installer therefore splices into the provider’s internal processor array and rebuilds the multi-processor delegate. That uses **undocumented `_sharedState` / `_activeSpanProcessor` fields** — acceptable for a platform-owned module if you **pin EDOT + OTel versions** and run a smoke test on every upgrade.

Sketch (simplified):

```ts
import { logs, trace, context as otelContext } from '@opentelemetry/api';
import { getActiveTeamName, TEAM_ATTRIBUTE_KEY } from './teamContext';

function teamAttributes(ctx = otelContext.active()) {
  const team = getActiveTeamName(ctx);
  return team ? { [TEAM_ATTRIBUTE_KEY]: team } : {};
}

export const TeamLogRecordProcessor = {
  onEmit(logRecord, ctx) {
    logRecord.setAttributes(teamAttributes(ctx));
  },
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

export const TeamSpanProcessor = {
  onStart(span, parentContext) {
    span.setAttributes(teamAttributes(parentContext));
  },
  onEnd() {},
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

export function installTeamProcessors() {
  // Splice Team*Processor into logger + tracer provider chains (implementation in @mfe/telemetry).
}
```

**Do not** call `installTeamProcessors()` only from the lazy webpack entry if you care about earliest resource-timing batches: those can flush from idle callbacks soon after init. The **IIFE in HTML** covers the gap before the app chunk loads.

**Alternatives if you want to avoid internal processor splicing:**

| Option | Trade-off |
| --- | --- |
| Ask Elastic for a supported `onStartBrowserSdk` / `processors` extension on the bundle | Cleanest long term; blocked on product |
| Switch shell init to **`import { startBrowserSdk } from '@elastic/opentelemetry-browser'`** (package, not bundle) and pass `processors` via upstream `startLogsSdk` / `startTracesSdk` | Loses “bundle only” constraint for the host |
| Keep `instrumentations` hooks only for the few types that support them | Incomplete coverage for logs; duplicates span logic already handled by `TeamSpanProcessor` |

### 1.3 Export / proxy

Follow [Proxy and CORS configuration](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/browser/configuration) for OTLP ingress. No API keys in browser config; the proxy injects authorization.

## Phase 2 — `@mfe/telemetry` (shared by all UI packages)

**Owner:** platform / shell team. **Consumers:** shell and each remote (runtime import only; remotes do not load the EDOT bundle).

### 2.1 Dependencies

- `@opentelemetry/api` as a **Module Federation shared singleton** (add to `packages/webpack-shared/federation-shared.js` alongside React) so every chunk uses the same `Context` keys.

### 2.2 Public API (sketch)

| Export | Purpose |
| --- | --- |
| `TEAM_ATTRIBUTE_KEY` | `'team.name'` |
| `TEAM_NAMES` | Registry constants |
| `createTeamContextKey()` | Internal `createContextKey` (not exported to apps if you expose only helpers) |
| `runWithTeam(teamName, fn)` | `context.with(active.setValue(key, teamName), fn)` |
| `getActiveTeamName()` | Read current team from context; default `platform-shell` |
| `installTelemetryBridge()` | Replaces `globalThis.__MFE_TELEMETRY__` with context-aware `getTeamName()` |
| `installTeamProcessors()` | Registers `TeamLogRecordProcessor` + `TeamSpanProcessor` (also shipped in IIFE for HTML) |
| `MicrofrontendBoundary` | React wrapper: sets team context for subtree (uses `runWithTeam` around render/effects where needed) |
| `getTracer(name)` | Thin wrapper: optional helper for custom spans that sets `team.name` in `onStart` |

`installTelemetryBridge()` runs as the **first import** in `packages/shell/src/index.tsx` (before React bootstrap). `installTeamProcessors()` is idempotent: the HTML IIFE runs it first; the shell entry may call it again as a no-op.

### 2.3 React integration pattern

**Shell** (`App.tsx`): wrap each lazy remote route:

```tsx
<MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
  <Suspense …><AuthApp /></Suspense>
</MicrofrontendBoundary>
```

**Each remote** (`App.tsx` root): wrap internal routes with the same team constant so standalone module logic keeps correct context if the boundary is ever reused, and so event handlers started inside the remote subtree inherit team context:

```tsx
export default function App() {
  return (
    <MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
      {/* routes */}
    </MicrofrontendBoundary>
  );
}
```

Use **double boundaries** (shell + remote) intentionally: shell guarantees attribution when a remote forgets; remote guarantees attribution for code paths mounted only inside the remote entry.

### 2.4 Custom spans and logs (team-owned code)

Document for teams:

```ts
import { logs, trace } from '@opentelemetry/api';
import { getActiveTeamName } from '@mfe/telemetry';

const tracer = trace.getTracer('@mfe/auth');
tracer.startActiveSpan('login.submit', (span) => {
  span.setAttribute('team.name', getActiveTeamName());
  // ...
  span.end();
});

logs.getLogger('@mfe/auth').emit({
  body: 'Login failed',
  attributes: { 'team.name': getActiveTeamName() },
});
```

Prefer running custom work inside `runWithTeam` so automatic fetch/XHR children inherit context and receive `team.name` from `TeamSpanProcessor` / `TeamLogRecordProcessor`.

### 2.5 `@mfe/contracts`

Stay **types-only**. HTTP clients in contracts do not set `team.name`; the **calling MFE’s context** determines attribution when fetch runs inside `runWithTeam` / `MicrofrontendBoundary`.

### 2.6 Auth session lifecycle

On logout in `@mfe/auth`, call `globalThis`/`window` reference to EDOT session API if exposed: store `startBrowserSdk` return value on `globalThis.__EDOT_SDK__` from the shell init script and invoke `endSession()` on logout so the next user does not share `session.id` ([EDOT session docs](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/browser/configuration#session-details)).

## Phase 3 — Team adoption checklist

Each owning team (auth, dashboard, photo):

1. Add dependency on `@mfe/telemetry`.
2. Wrap remote root with `MicrofrontendBoundary` using their `TEAM_NAMES.*` constant.
3. Wrap long-lived async work (thunks, `setTimeout`, manual promises) with `runWithTeam` when started outside React render.
4. Add Kibana / Discover saved filters: `team.name : "<their-team>"`.
5. Do **not** add the EDOT script tag to remote `index.html` (per standalone decision).

Shell team additionally maintains vendor bundle copy, init script, proxy URL wiring, and federation shared config for `@opentelemetry/api`.

## Phase 4 — Verification

This is the **full** acceptance pass after **Steps 0–11**. For day-to-day work, use the per-step checklists in [Execution roadmap](#execution-roadmap-verifiable-steps).

1. Shell at `localhost:3000` with proxy forwarding to Elastic ingest.
2. Browse `/`, `/auth/login`, `/dashboard`, `/photo/:id`; confirm console has no EDOT errors.
3. In Elastic: filter traces and logs by `team.name` per route; shell navigation logs should show `platform-shell`, auth API calls from login should show `identity`, etc.
4. Regression: confirm `remoteEntry.js` loads are ignored or tagged as shell (resource timing may still reflect shell loading remotes — document as expected noise or add URL-based overrides later).

## Known limitations and follow-ups

| Limitation | Mitigation / follow-up |
| --- | --- |
| Page-level `documentLoad` and shell-driven `remoteEntry.js` resource timing | Attribute as `platform-shell`; accept as host noise or split shell loading into a dedicated “platform-loader” team name for those URLs only |
| `instrumentations` config stability | Default EDOT instrumentations only; no custom `instrumentations` map |
| Processor registration uses internal provider fields | Test `installTeamProcessors()` whenever `public/vendor/elastic-otel-browser.min.js` is replaced; track version in `EDOT_BROWSER_VERSION`; prefer a public extension API when available |
| Standalone remote dev has no RUM | Teams validate telemetry via integrated shell (port 3000) or a future “shell dev with remote override” workflow |
| Idle / background callbacks may drop team context | `resolveTeam` falls back to `__MFE_TELEMETRY__.getTeamName()`; use boundaries around remotes and avoid long async hops without `runWithTeam` |
| Backend correlation | Ensure API propagates W3C trace context; browser `external.http` spans already carry `team.name` |

## Implementation order (suggested)

Follow **[Execution roadmap](#execution-roadmap-verifiable-steps)** (Steps 0–11). Summary mapping:

| Roadmap step | Topic |
| --- | --- |
| 0 | Baseline app |
| 1–2 | Vendor file + `startBrowserSdk` |
| 3 | Proxy / OTLP |
| 4–5 | `@mfe/telemetry` + processors IIFE |
| 6–8 | Boundaries (shell → remotes) |
| 9–11 | Logout session, prod build, team rollout |

## Open items (non-blocking)

- Replace placeholder team ids (`identity`, `gallery`, `media-detail`) with official org identifiers.
- Choose how `serviceVersion` and environment are injected (CI variables vs runtime `window.__CONFIG__`).
- Decide session sampling (`session.sampleRate`) for production traffic volume.