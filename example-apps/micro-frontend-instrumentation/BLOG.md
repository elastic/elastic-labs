# Observability in a federated frontend: one browser agent, many teams

Large frontends often outgrow a single repository and a single release train. **Microfrontends** split the UI into pieces that **align with team boundaries**: each group owns a vertical slice—login, a dashboard, a checkout flow—and ships on its own cadence while users still see one product.

That goal shows up in several **shapes**, and the shape affects how you run and observe the browser:

- **Build-time composition** — packages are linked at build time (monorepo or multi-package app). Teams own folders or workspaces; runtime is still one bundle unless you split further.
- **Runtime integration via iframes or Web Components** — strong isolation, sometimes separate documents and origins. Telemetry can be per-frame or per widget, with clear boundaries but more integration overhead.
- **Module Federation (and similar)** — independently built **remote** entry points load into a **host shell** at runtime. Teams deploy artifacts; the browser executes one app with shared libraries and often a **shared client router**.
- **Orchestration frameworks** (e.g. single-spa) — lifecycle and mounting of multiple SPAs on one page; team ownership maps to registered applications and routes.

Across these models, organizations gain **clear ownership**, parallel delivery, and contracts between platform and feature teams. Observability should respect the same lines: platform SREs care about the whole journey; product teams want signals **without wading through everyone else’s clicks and HTTP calls**.

**Labeling telemetry per team** helps on both sides. In Elastic (or any OTLP backend), a stable attribute such as **`team.name`** on spans and log records lets each team build Discover views and alerts for their slice—while the product can still be modeled as **one browser service** for session and end-to-end tracing. Without that label, a single RUM agent on a composed page reports one undifferentiated stream; with it, auth noise does not drown out gallery work in a team’s dashboard.

In this post we instrument one concrete variant: **Module Federation plus client-side routing**—a shell host that lazy-loads team-owned remotes under route prefixes, with shared React and `react-router-dom`. We use **EDOT Browser** (bundle in the shell only) and a small **`@mfe/telemetry`** layer so **`team.name`** is attached without each team shipping its own agent.

## The application

The sample is a photo gallery monorepo in [elastic-labs](https://github.com/elastic/elastic-labs/tree/main/example-apps/micro-frontend-instrumentation). A **shell** loads three **remotes** at runtime—**auth**, **dashboard**, and **photo**—over a shared REST API. Webpack Module Federation exposes `remoteEntry.js` per remote; the shell maps URLs like `/auth/*`, `/dashboard/*`, and `/photo/:photoId` to federated `App` components. Everything runs in **one tab, one JavaScript realm** even though each team builds and deploys independently.

Shared **contracts** are types only (no UI). The shell owns global layout; each remote owns its sub-routes under its mount path.

```text
example-apps/micro-frontend-instrumentation/
└── packages/
    ├── shell/              # host — EDOT bundle, router, loads remotes
    ├── auth/               # remote — /auth/*
    ├── dashboard/          # remote — /dashboard/*
    ├── photo/              # remote — /photo/:photoId
    ├── contracts/          # shared API types (no UI)
    ├── api/                # REST backend (auth, photos, comments)
    └── webpack-shared/     # Module Federation shared deps (React, OTel API, …)
```

## One agent, many producers

For Module Federation, **one browser SDK per page** is the right default: one document load, one session, traces that can span shell → remote → API. Giving every team its own EDOT install would duplicate instrumentation and break global session semantics.

So we keep a single `serviceName` in Elastic (`photo-service-web`) and separate concerns with **`team.name` on each span and log record**. Resource-level SDK tags describe the whole app; **signal-level** attributes must reflect **which microfrontend was active** when the signal was created—hence boundaries and processors later in this post.

## Design choices at a glance

| Decision | Rationale |
| -------- | ----------- |
| EDOT **bundle** in the shell only | No npm dependency on EDOT in app packages; vendored `elastic-otel-browser.min.js` checked into the shell |
| **One** `startBrowserSdk` per tab | Remotes never start the agent; standalone dev ports do not emit browser OTLP |
| **`@mfe/telemetry`** | Shared boundaries, team constants, processor install, session helpers—not in contracts |
| **`team.name` on traces and logs** | One service name in Elastic; teams filter on `team.name` |
| **Team processors** | Stamp attributes on all automatic instrumentation without per-instrumentation hooks |

## Step 1 — Load the agent in the shell

We ship **EDOT as a prebuilt browser bundle**, not as an npm dependency in the monorepo. The minified file is checked in under `packages/shell/public/vendor/` and exposes `startBrowserSdk` on `globalThis`. That keeps the platform team from wiring OpenTelemetry packages, instrumentations, and version alignment into webpack for every app—EDOT already bundles the SDK and defaults tuned for Elastic Observability.

Only the shell’s `index.html` loads that script and calls `startBrowserSdk` **before** the federated app entry. Remotes are chunks loaded later; they inherit the already-running agent and globals.

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

Vendor files live in `public/vendor/`, but webpack does not bundle them into `main.js`. The shell uses **`copy-webpack-plugin`** to copy `public/vendor` into `dist/vendor` on production build, and `devServer.static` serves `public/` in development so `/vendor/elastic-otel-browser.min.js` resolves the same way locally and in nginx/Docker.

```js
new CopyWebpackPlugin({
  patterns: [
    { from: path.resolve(__dirname, "public/vendor"), to: "dist/vendor" },
  ],
}),
```

From here, automatic instrumentations (document load, `fetch`, user actions, navigation timing, and others) are active for the whole tab.

## Step 2 — Shared federation modules

Module Federation already shares `react` and `react-router-dom` as singletons. We extended the same `sharedDependencies` map in `packages/webpack-shared/federation-shared.js` with **`@opentelemetry/api`** and **`@mfe/telemetry`**. Both are **singletons**: webpack loads one physical module per version, so every host and remote sees the same context keys, the same team stack, and the same bridge helpers.

Without that, each remote could bundle its own copy of `@opentelemetry/api`. `createContextKey` would no longer match across chunks, and automatic instrumentation from the shell agent would not line up with what feature teams read in manual code.

Sharing the API also means **each team can use manual instrumentation** in its microfrontend without pulling in the full EDOT bundle. After the shell starts the agent, remotes import the lightweight API and talk to the global tracer and logger providers:

```ts
import { trace, logs } from "@opentelemetry/api";

trace.getTracer("@mfe/auth").startActiveSpan("login.submit", (span) => {
  // business logic
  span.end();
});

logs.getLogger("@mfe/auth").emit({
  body: "Login validation failed",
});
```

You do not set **`team.name`** by hand in every span or log: **Step 4** introduces **`MicrofrontendBoundary`** wrappers that establish team context for a subtree. The **team processors** from Step 3 stamp that context onto automatic instrumentation; boundaries do the same for manual spans and logs created inside the wrapped UI.

```js
// packages/webpack-shared/federation-shared.js (excerpt)
const sharedDependencies = {
  react: { singleton: true, requiredVersion: "^18.3.1", eager: true },
  "react-dom": { singleton: true, requiredVersion: "^18.3.1", eager: true },
  "react-router-dom": { singleton: true, requiredVersion: "^6.28.0", eager: true },
  "@opentelemetry/api": { singleton: true, requiredVersion: "^1.9.0", eager: true },
};
```

Conceptually, federation gives you **independent deployables**; shared telemetry modules give you **one coherent observation context** inside the host page, while still letting teams add their own spans and log records where automatic instrumentation is not enough.

## Step 3 — Team processors (central stamping)

Not every browser instrumentation exposes a hook to add custom attributes on log records. The upstream pattern is a **`LogRecordProcessor`** (and the span equivalent) on the global provider EDOT installs. **Supported hooks to register those processors from the EDOT browser bundle are planned for a future EDOT release**; until then, the platform wires processors against the globals the bundle sets up today.

That logic lives in a shared workspace package, **`@mfe/telemetry`**, alongside **`installTeamProcessors`**, the team processor implementations, the telemetry bridge, and later the **boundary** helpers. Shell and remotes depend on it; it is listed as a **Module Federation singleton** in `packages/webpack-shared/federation-shared.js` (same place as `@opentelemetry/api` in Step 2) so every chunk uses one install path and one team context stack.

A small **IIFE** built from `@mfe/telemetry` runs in the shell’s `index.html` immediately after `startBrowserSdk`. It calls `installTeamProcessors()` and registers processors that set **`team.name`** on every span start and log emit, reading the active team from `__MFE_TELEMETRY__.getTeamName(ctx)`. The shell inline script does not need to know about routes or teams.

```html
<script src="/vendor/mfe-telemetry-processors.iife.js"></script>
<script>
  globalThis.__MFE_TELEMETRY_INSTALL__?.installTeamProcessors();
</script>
```

Processors are **`unshift`ed** onto the provider’s internal processor list—the multi-processor delegate already references that array, so registration stays short without rebuilding the SDK. When EDOT exposes first-class processor configuration on `startBrowserSdk`, this install helper can shrink to passing processors in config; the **`team.name`** semantics and **`@mfe/telemetry`** boundaries stay the same.

## Step 4 — Boundaries: where the team context lives

Processors from Step 3 need a **current team** at emit time. That value does not come from which npm package built the code—Webpack and Module Federation do not tag `fetch` or click logs with “auth” vs “dashboard” by default. It comes from **which slice of the UI tree** was active when the signal was created.

Attributes therefore follow **OpenTelemetry context**, not repository boundaries. Shared **contracts** stay types-only: HTTP clients do not hardcode `team.name`. The microfrontend that triggered the work—wrapped in a boundary—defines attribution for automatic and manual telemetry alike.

### `MicrofrontendBoundary`

`@mfe/telemetry` exports **`MicrofrontendBoundary`**, a React wrapper that does three things at a high level:

1. **`runWithTeam`** during render so synchronous work and children start under the right OpenTelemetry context.
2. A small **UI team stack** (push on mount, pop on unmount) so `getTeamName()` still resolves correctly when async browser work does not carry context—common for user-action logs and some `fetch` calls kicked off from handlers.
3. A `data-mfe-team` marker on a `display: contents` wrapper for debugging and tests without affecting layout.

Step 3 processors call `__MFE_TELEMETRY__.getTeamName(ctx)`; boundaries are what make that answer match the team that owns the screen.

### Shell and remote both wrap

**Shell** owns composition: it wraps the global layout in `TEAM_NAMES.platformShell` and wraps each federated route with that remote’s id. **Each remote** wraps its own `App` root with the same constant when the shell loads it.

```tsx
// Shell — route to auth remote
<MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
  <Suspense fallback={…}>
    <AuthApp />
  </Suspense>
</MicrofrontendBoundary>
```

```tsx
// Auth remote — federated App entry
export default function App() {
  return (
    <MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
      <Routes>{/* login, register, … */}</Routes>
    </MicrofrontendBoundary>
  );
}
```

The **double boundary** is deliberate. The shell guarantees correct `team.name` when a team forgets to wrap an export, when `Suspense` or routing mounts the remote, or when you reorganize host routes. The remote guarantees attribution when that package is developed or tested in isolation against the same constant. Nested boundaries push onto the same stack; the **innermost** team wins for telemetry while a child remote is mounted—so gallery traffic does not inherit `platform-shell` just because the header still belongs to the host.

### Team registry

Canonical ids live in **`TEAM_NAMES`** inside `@mfe/telemetry` (`platform-shell`, `identity`, `gallery`, `media-detail`, …). Product teams import the constant instead of scattering string literals; platform aligns those values with Kibana saved filters and ownership docs.

### When React is not enough

Long-lived work started **outside** render—manual `setTimeout`, one-off promises, or legacy callbacks—should use **`runWithTeam`** from the same package so context matches the boundary. That is the exception; most UI paths are covered by `MicrofrontendBoundary` around the route or `App` root.

## Step 5 — Sessions and logout

**EDOT Browser** includes **session management** aimed at RUM: it groups traces and logs into browser sessions, applies session-level sampling, and can correlate activity across tabs of the same origin. You do not implement sessions yourself; they start when the agent initializes and user activity keeps them alive.

Sampled sessions add attributes such as **`session.id`**, and often **`session.previous_id`** after rotation, **`session.sampling_rate`**, and **`browser.tab.id`**, on **spans and log records** exported to Elastic. Those fields sit alongside **`team.name`** from Steps 3–4, so you can analyze “this auth team’s traffic in session X” without conflating two users on a shared machine.

Store the return value of `startBrowserSdk` on a global the shell controls—for example `globalThis.__EDOT_SDK__`—so application code can call session APIs without importing the full EDOT bundle:

```html
<script>
  globalThis.__EDOT_SDK__ = startBrowserSdk({ /* … */ });
</script>
```

**Application auth** and **RUM session** are different concepts. Clearing a JWT from `localStorage` does not automatically start a new browser RUM session. If a second user signs in on the same tab without ending the RUM session, their traces and logs may still carry the **previous** `session.id`, which blurs user journeys in Discover.

When the product’s “user session ends” moment fires—here, **Log out** in the shell header—run **`endSession()`** on the EDOT handle **before** clearing app auth state. `@mfe/telemetry` wraps that as **`endBrowserEdotSession()`**:

```ts
function onLogout() {
  endBrowserEdotSession();
  clearSession();
  navigate("/", { replace: true });
}
```

EDOT ends the current session, notifies session lifecycle observers, and starts fresh session state on the next qualifying activity. The next exported events should get a **new** `session.id` (with the prior id available as `session.previous_id` where applicable).

Logout UI lives in the **shell** in this sample, not in the auth remote, but the rule is the same wherever logout is defined: pair **identity teardown** with **`endSession()`** whenever a different person might use the same browser tab.

Optional tuning—`session.sampleRate`, inactivity timeout, `maxDuration`—is configured on `startBrowserSdk` when you need to control volume in production; defaults are fine for the lab app.

## What teams see in Elastic

One service, many lenses:

```text
service.name : "photo-service-web" and team.name : "identity"
service.name : "photo-service-web" and team.name : "gallery"
```

After visiting only auth, a filter on `identity` should not surface dashboard-only `fetch` spans—proof that boundaries and processors are doing their job.

In **Elastic APM** service views, the same idea applies beyond ad hoc Discover queries: once `team.name` is on exported spans and logs, you can filter **service details** (latency, throughput, transaction and span breakdowns, and related RUM metrics) by **`team.name`** so each team sees performance data for **their slice of the UI**, not the whole federated page. Platform keeps one browser service; feature teams get dashboards that match the boundaries they ship.

## What we deliberately did not do

- **No EDOT on remote standalone ports** — teams validate RUM through the shell; local remote-only dev stays lightweight.
- **No npm install of EDOT in the monorepo** — the shell vendors the bundle; platform owners bump the file on upgrade.
- **No per-instrumentation attribute hooks** — processors cover navigation timing, resource timing, and other log emitters that do not offer custom hooks.

## Conclusion

Module Federation optimizes for **team autonomy in build and deploy**. Browser RUM optimizes for **one agent per page**. Those two goals only conflict if every team instruments itself, or if one undifferentiated stream lands in Elastic with no way to tell who produced each signal.

What we built instead is a **platform-shaped pipeline** owned mostly by the shell and **`@mfe/telemetry`**:

1. **Vendored EDOT bundle** in the host — no OpenTelemetry dependency graph in every package; `CopyWebpackPlugin` keeps vendor assets on the same URLs in dev and production.
2. **Federation singletons** for `@opentelemetry/api` and `@mfe/telemetry` — one context, manual spans from any remote, one place for install helpers and `TEAM_NAMES`.
3. **Team processors** (today via `installTeamProcessors`, tomorrow via first-class EDOT config) — stamp **`team.name`** on automatic spans and logs, including instrumentations that offer no custom hooks.
4. **`MicrofrontendBoundary`** — turn route and remote ownership into active team context; shell and remotes both wrap so attribution survives independent releases.
5. **EDOT sessions** — `session.id` and related fields for journey analysis; **`endSession()`** on logout so the next user does not inherit someone else’s RUM session.

In Elastic you still see **one browser service** (`photo-service-web`) for session continuity and cross-remote traces. Teams work in parallel on **`team.name`**—and, when needed, on **`session.id`**—without forking the agent or the deployment model.

Other microfrontend styles (iframes, orchestrators, build-time monoliths) may need different boundary mechanics, but the pattern repeats: **one observability entry point**, **shared API for feature teams**, and **explicit ownership attributes** on every signal.

For step-by-step verification and repo layout, see [INSTRUMENTATION_PLAN.md](./INSTRUMENTATION_PLAN.md) in [elastic-labs](https://github.com/elastic/elastic-labs/tree/main/example-apps/micro-frontend-instrumentation).