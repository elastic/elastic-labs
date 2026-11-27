# Observability in a federated frontend: one browser agent, many teams

We instrumented a Module Federation photo app with **EDOT Browser** so platform and feature teams can filter Real User Monitoring (RUM) to **only the telemetry their microfrontend produced**—without running separate agents per team or splitting the product into unrelated services in Elastic.

## The application

The sample is a small photo gallery: a **shell** host on port 3000 loads three **remotes** at runtime—**auth** (login/register), **dashboard** (gallery), and **photo** (detail and comments)—over a shared REST API. Webpack Module Federation shares React and the router so every remote runs in **one browser tab, one JavaScript realm**, even though each team builds and deploys its own package independently.

Shared **contracts** hold API types only; they are not a runtime UI layer. That keeps team ownership clear: each remote owns its routes and UI, the shell owns composition and global chrome.

## Why “one service” is not enough for teams

A single RUM deployment is the right default for Module Federation. You get one page load, one session story, and traces that span shell → remote → API. If every team installed its own browser SDK, you would fight double instrumentation, conflicting globals, and duplicated session logic.

The product still appears as **one frontend service** in Elastic (`photo-service-web` in our setup). What teams need for day-to-day work is different: in Discover or Traces they want filters like “show me auth clicks and `fetch` calls, not dashboard noise.” That means every span and log record needs a stable attribute—we use **`team.name`**—that identifies which microfrontend (which team) was active when the signal was created.

Resource-level tags on the SDK are not enough. They describe the whole page. Per-team filtering needs **signal-level** attributes on spans and log records, derived from **which part of the React tree** (or which async work) was running at emit time.

## Design choices at a glance

| Decision | Rationale |
| -------- | ----------- |
| EDOT **bundle** in the shell only | No npm dependency on EDOT in app packages; vendored `elastic-otel-browser.min.js` checked into the shell |
| **One** `startBrowserSdk` per tab | Remotes never start the agent; standalone dev ports do not emit browser OTLP |
| **`@mfe/telemetry`** | Shared boundaries, team constants, processor install, session helpers—not in contracts |
| **`team.name` on traces and logs** | One service name in Elastic; teams filter on `team.name` |
| **Team processors** | Stamp attributes on all automatic instrumentation without per-instrumentation hooks |

## Step 1 — Load the agent in the shell

Only the shell’s `index.html` loads the EDOT bundle and calls `startBrowserSdk` before the webpack entry. Remotes are federated chunks; they inherit the already-running OpenTelemetry globals.

```html
<script src="/vendor/elastic-otel-browser.min.js" crossorigin></script>
<script>
  globalThis.__EDOT_SDK__ = startBrowserSdk({
    serviceName: "photo-service-web",
    exportConfig: {
      url: "https://your-otlp-ingest.example",
    },
  });
</script>
```

From here, automatic instrumentations (document load, `fetch`, user actions, navigation timing, and others) are active for the whole tab.

## Step 2 — Shared federation modules

Module Federation already shares `react` and `react-router-dom` as singletons. We added **`@opentelemetry/api`** and **`@mfe/telemetry`** the same way so every remote shares one context key and one team stack. Without that, each remote’s copy of OpenTelemetry context would not see the same “current team.”

Conceptually, federation gives you **independent deployables**; shared telemetry modules give you **one coherent observation context** inside the host page.

## Step 3 — Team processors (central stamping)

Not every browser instrumentation exposes a hook to add custom attributes on log records. The supported pattern is a **`LogRecordProcessor`** (and the analogue for spans) on the global provider EDOT installs.

A small install script runs immediately after `startBrowserSdk` and registers **team processors** that set `team.name` on every span start and log emit. They read the active team from a bridge (`__MFE_TELEMETRY__.getTeamName(ctx)`), so the shell inline script does not need to know about each route.

Processors are **`unshift`ed** onto the provider’s internal processor list—the multi-processor delegate already references that array, so registration stays a few lines without rebuilding the SDK.

## Step 4 — Boundaries: where the team context lives

Attributes follow **context**, not package names. HTTP clients in shared contracts do not hardcode a team; the **caller’s boundary** decides attribution.

We introduced **`MicrofrontendBoundary`**: a React wrapper that combines OpenTelemetry `context.with` with a small UI-team stack for work that loses async context (clicks, idle callbacks, and similar).

```tsx
<MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
  <Suspense fallback={…}>
    <AuthApp />
  </Suspense>
</MicrofrontendBoundary>
```

**Shell** wraps its layout in `platform-shell` and wraps each federated route with that remote’s team id. **Each remote** wraps its own `App` root with the same constant. That double boundary is intentional: shell protects platform routing; the remote protects code paths that only exist inside the federated entry.

Registry constants (`identity`, `gallery`, `media-detail`, …) live in `@mfe/telemetry` so Kibana filters and code stay aligned.

## Step 5 — Sessions and logout

RUM sessions are browser-wide. When the shell clears auth on logout, it also calls **`endSession()`** on the EDOT handle so the next user does not inherit the previous `session.id`.

```ts
endBrowserEdotSession();
clearSession();
```

Logout lives in the shell header in this app, not in the auth remote—but the pattern is the same wherever “user session ends” is defined.

## What teams see in Elastic

One service, many lenses:

```text
service.name : "photo-service-web" and team.name : "identity"
service.name : "photo-service-web" and team.name : "gallery"
```

After visiting only auth, a filter on `identity` should not surface dashboard-only `fetch` spans—proof that boundaries and processors are doing their job.

## What we deliberately did not do

- **No EDOT on remote standalone ports** — teams validate RUM through the shell; local remote-only dev stays lightweight.
- **No npm install of EDOT in the monorepo** — the shell vendors the bundle; platform owners bump the file on upgrade.
- **No per-instrumentation attribute hooks** — processors cover navigation timing, resource timing, and other log emitters that do not offer custom hooks.

## Closing thought

Module Federation optimizes for **team autonomy in build and deploy**. Browser RUM optimizes for **one agent per page**. The glue is a thin platform layer—shared telemetry module, federated singletons, shell-only agent load, and **boundaries** that map UI ownership to **`team.name`**. Teams keep independent microfrontends; observability stays one product with filters that respect team boundaries.

For implementation checklists and verification steps, see [INSTRUMENTATION_PLAN.md](./INSTRUMENTATION_PLAN.md) in this repository.