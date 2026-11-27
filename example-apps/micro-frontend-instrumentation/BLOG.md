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
  "@mfe/telemetry": { singleton: true, requiredVersion: "0.0.1", eager: true },
};
```

Conceptually, federation gives you **independent deployables**; shared telemetry modules give you **one coherent observation context** inside the host page, while still letting teams add their own spans and log records where automatic instrumentation is not enough.

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