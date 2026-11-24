# Microfrontend independent deployment plan (Elaspic UI)

This plan moves Elaspic from **one Vite SPA with lazy-loaded folders** to **independently buildable and deployable microfrontends (MFEs)** so multiple teams can ship on their own cadence. Each step is designed to be mergeable and **verifiable** before the next step starts.

## Current state (baseline)

| Aspect | Today |
| --- | --- |
| Structure | Single package under `ui/`; “microfrontends” are directories under `ui/src/microfrontends/` |
| Loading | `React.lazy()` + dynamic `import()` inside one bundle (see `ui/src/App.jsx`) |
| Deploy | One Docker image (`ui/`) → static `dist/` → edge nginx → browser |
| Team boundaries (logical) | **platform**: shell, auth, shared components; **identity**: login, register; **pics**: `/pics/*`; **users**: `/users/*` |
| Cross-MFE deps | All MFEs import `../../api/client.js`, `../../auth/AuthContext.jsx`, and shared `components/` |

**What “independently deployable” means here:** each team can change, build, publish, and roll back **its** browser assets **without** rebuilding or redeploying the shell or other teams’ MFEs. The shell may still need a configuration update to point at a new remote URL or version, but not a full monolith release.

## Target state (high level)

```text
Browser :8080
    │
    ▼
 edge nginx
    ├── /api/*           → api (unchanged for early phases)
    ├── /mfe/pics/*      → pics remote static (example path)
    ├── /mfe/users/*     → users remote static
    ├── /mfe/identity/*  → identity remote static (login + register)
    └── /*               → shell host SPA (routing + layout)
```

- **Shell (platform team):** routing, layout (`Shell`, `Header`, `Sidebar`), auth provider, error pages, federation host config.
- **Remotes (feature teams):** expose route modules (e.g. `PicsRoutes`, `UsersRoutes`) via **Module Federation** (recommended) or an equivalent runtime integration pattern.
- **Shared library:** npm workspace package(s) for API client, auth hooks contract, and optionally UI primitives—versioned so teams agree on semver boundaries.

Recommended stack for this repo: **Vite + `@originjs/vite-plugin-federation`** (or `@module-federation/vite`) as host/remotes, **npm workspaces** at repo root, **one Compose service per remote** in later phases (or object storage + CDN in production).

---

## Decisions to make before implementation

### Locked in (stakeholder choices)

| # | Decision |
| --- | --- |
| D1 | **Module Federation** (Vite host + remotes) |
| D2 | **Monorepo with npm/pnpm workspaces** |
| D5 | **Same-origin** remote URLs (e.g. `/mfe/pics/`) behind edge nginx for the first production target |

The phases below assume these choices. Remaining items still need governance sign-off.

Resolve the rest in working agreements; where noted, the **recommended** column is the default if you defer.

| # | Topic | Options | Recommended for Elaspic | Impact if deferred |
| --- | --- | --- | --- | --- |
| D1 | **Integration pattern** | *(locked: Module Federation)* | — | — |
| D2 | **Repository layout** | *(locked: monorepo workspaces)* | — | — |
| D3 | **Shared code policy** | Shared npm package(s); duplicate allowed; federation `shared` config only | `@elaspic/platform-sdk` (api + auth types/hooks) + optional `@elaspic/ui-kit` for EUI wrappers | Version skew on React/EUI |
| D4 | **React singleton** | Strict single version via federation `shared`; teams may lag patch versions | Exact match on `react`, `react-dom`, `react-router-dom`, `@elastic/eui` in all builds | Runtime hook errors, duplicate React |
| D5 | **Remote URL strategy** | *(locked: same origin `/mfe/<name>/`)* | — | — |
| D6 | **Shell ↔ remote contract** | Exposed modules + semver; manifest file listing remotes/versions | Each remote exposes one default route component + `remoteEntry.js`; shell loads from env/manifest | Breaking changes without notice |
| D7 | **Identity MFE shape** | One remote (login+register); two remotes | One **identity** remote (both routes, one team) | Extra deployables for little gain |
| D8 | **Auth ownership** | Shell owns `AuthProvider`; remotes call shared hooks only | Shell owns provider; identity remote owns login/register UI only | Token handling duplicated |
| D9 | **API / backend** | Stay monolithic API; later BFF per domain | Unchanged in this plan; UI-only independence | N/A for UI MFE plan |
| D10 | **Telemetry** | Keep single browser RUM in shell (`INSTRUMENTATION_PLAN.md`) | Shell initializes OTel; remotes use shared `recordUiEvent` from platform SDK | Duplicate agents or missing team labels |
| D11 | **Release & rollback** | Blue/green per remote; immutable versioned folders (`/mfe/pics/v1.2.3/`) | Versioned asset paths + shell manifest pointer | Cannot roll back one team safely |
| D12 | **Local dev ergonomics** | `turbo`/`npm run dev:all`; shell proxies to remote dev servers | Root script starts shell + selected remotes on fixed ports | Teams blocked on integration testing |

---

## Implementation phases (incremental, testable)

### Phase 0 — Align teams and contracts (no production behavior change)

**Status:** Engineering artifacts complete; **team sign-off pending**.

**Deliverables**

| Artifact | Purpose |
| --- | --- |
| [docs/MFE_TEAMS.md](./docs/MFE_TEAMS.md) | Team ↔ route ↔ folder mapping + sign-off table |
| [docs/MFE_REMOTE_CONTRACT.md](./docs/MFE_REMOTE_CONTRACT.md) | Federated exposes, shared deps, host/remote rules |
| [docs/MFE_GOVERNANCE.md](./docs/MFE_GOVERNANCE.md) | Decision log D1–D12 (locked + adopted defaults) |
| [.github/CODEOWNERS](./.github/CODEOWNERS) | Review ownership (replace `@your-org/*` placeholders) |

**Work**

- [x] Confirm team ↔ route ↔ folder mapping (see [MFE_TEAMS.md](./docs/MFE_TEAMS.md) and `INSTRUMENTATION_PLAN.md`).
- [x] Add `CODEOWNERS` for current `ui/` paths and future `packages/shell`, `packages/mfe-*`, `packages/platform-sdk`.
- [x] Write **Remote contract** ([MFE_REMOTE_CONTRACT.md](./docs/MFE_REMOTE_CONTRACT.md)).
- [x] Record D1–D12 ([MFE_GOVERNANCE.md](./docs/MFE_GOVERNANCE.md)); D1, D2, D5 locked; D3–D4, D6–D12 adopted as recommended defaults.

**Test**

- [ ] Review meeting sign-off: each team knows owned routes and shared APIs they may import ([MFE_TEAMS.md](./docs/MFE_TEAMS.md) checklist).
- [ ] Replace `CODEOWNERS` placeholder teams with real GitHub teams.

**Rollback:** N/A (docs only).

---

### Phase 1 — npm workspaces and `platform-sdk` extraction (behavior unchanged)

**Status:** Complete (automated build verified; manual smoke optional).

**Work**

- [x] Root `package.json` workspaces (`ui`, `packages/*`) and dependency `overrides`.
- [x] `@elaspic/platform-sdk` — `api/client.js`, `auth/constants.js`, `auth/types.js` (JSDoc).
- [x] Microfrontends + `AuthContext` import `@elaspic/platform-sdk`; removed `ui/src/api/client.js`.
- [x] UI `Dockerfile` + `docker-compose.yml` build from repo root (includes workspace package).

**Test**

- [x] `npm run build:ui` from repo root succeeds.
- [ ] Manual smoke: login → pics grid → users list → logout.
- [x] `docker compose build ui` (Compose image includes platform-sdk).

**Rollback:** Revert workspace; restore `ui/src/api/client.js` and relative imports.

---

### Phase 2 — Physical package boundaries (still one bundle)

**Status:** Complete (build verified).

**Work**

- [x] `packages/shell` — layout, `App.jsx`, error routes.
- [x] `packages/mfe-identity`, `packages/mfe-pics`, `packages/mfe-users` — feature routes (from former `ui/src/microfrontends/`).
- [x] Thin `ui/` host — `main.jsx`, `icons.js`, `app.css` only.
- [x] `@elaspic/ui-kit` — shared components; `AuthProvider` / `useAuth` in `@elaspic/platform-sdk`.

**Test**

- [x] Each workspace package has `npm run build`.
- [x] `npm run build:ui` and `docker compose build ui` succeed.
- [ ] Manual smoke: login → pics → users → logout.

**Rollback:** Restore monolithic `ui/src` layout from git history.

---

### Phase 3 — Module Federation pilot: **pics** remote only

**Work**

- Enable federation on **shell (host)** and **mfe-pics (remote)**.
- Remote exposes e.g. `./PicsRoutes` (and internal chunks).
- Host replaces `lazy(() => import('./microfrontends/pics/...'))` with dynamic remote import from `VITE_MFE_PICS_URL` (default `http://localhost:5001/assets/remoteEntry.js` in dev).
- Configure federation `shared`: `react`, `react-dom`, `react-router-dom`, `@elastic/eui` as singletons.
- Keep **identity** and **users** as local lazy imports for now (hybrid mode).

**Test**

- [ ] Dev: shell on 5173, pics remote on 5001 — navigate to `/pics` and `/pics/:id`; upload and comments work.
- [ ] Prod-like: build both artifacts; serve remote statically; shell loads `remoteEntry.js` from configured URL.
- [ ] Change pics remote (e.g. copy on button label), rebuild **only** pics, refresh browser — change visible without shell rebuild.
- [ ] Failure: stop pics container — shell shows agreed error UI (define in contract), not white screen.

**Rollback:** Host import local `./microfrontends/pics` again; remove federation config from pics.

---

### Phase 4 — Federation for **users** and **identity**

**Work**

- Repeat Phase 3 for `mfe-users` and `mfe-identity`.
- Shell route table only references remotes; delete duplicated source from old `ui/src/microfrontends/`.
- Ensure `RequireAuth` stays in shell; remotes assume authenticated context via `useAuth()` from shared package.

**Test**

- [ ] Full regression path: register → login → pics → users galleries → logout.
- [ ] Independent deploy: bump users remote only; verify pics and identity unchanged (hash/manifest check).
- [ ] React Router nested routes work for all `/*` paths (deep links, refresh on `/users/:id/pics/:picId`).

**Rollback:** Per-remote toggle in shell env (`USE_LOCAL_MFE_USERS=true`) pointing to bundled fallback — optional safety valve worth implementing in this phase.

---

### Phase 5 — Edge nginx and Docker: separate deployables

**Work**

- Add static serving locations in `nginx/nginx.conf.template` for each remote (e.g. `location /mfe/pics/ { alias ...; }` or separate upstreams).
- Split Docker:
  - `shell` image (host only),
  - `mfe-pics`, `mfe-users`, `mfe-identity` images (or one generic `mfe-static` pattern with build args).
- Update `docker-compose.yml`: replace single `ui` service with `shell` + MFE services; env vars for remote URLs consumed at **shell build time** (Vite) and/or **runtime** (manifest JSON fetched from `/config/mf-manifest.json`).

**Test**

- [ ] `docker compose up --build` — all routes work at `http://localhost:8080`.
- [ ] Scale/restart: `docker compose restart mfe-pics` while browsing users — no impact on users routes.
- [ ] Deep links and SPA fallback: each remote’s `nginx-spa.conf` only serves its own assets; shell handles app routing.

**Rollback:** Compose profile `monolith` that builds legacy single `ui` image (keep Dockerfile until Phase 7).

---

### Phase 6 — Versioning, manifest, and team CI

**Work**

- Publish **MFE manifest** (JSON): remote name, URL, semver, compatibility `shellVersion`.
- CI pipelines (per package): lint, build, publish artifact to registry or S3; shell pipeline reads manifest for integration env only.
- Document rollback: repoint manifest to previous semver path.
- Align with `INSTRUMENTATION_PLAN.md`: shell loads OTel once; remotes use platform SDK for `elaspic.ui.team` attributes.

**Test**

- [ ] CI: pics pipeline green without running users pipeline.
- [ ] Staging: deploy pics `1.0.1` while shell still `1.0.0`; compatibility matrix passes.
- [ ] Observability: filter logs/traces by `elaspic.ui.team` after split deploy.

**Rollback:** Manifest points to last known good remote URLs.

---

### Phase 7 — Decommission monolith `ui/` layout

**Work**

- Remove transitional `ui/src/microfrontends/` and unified bundle Dockerfile if no longer needed.
- Update `ui/README.md` and root `README.md` architecture diagrams.
- Optional: extract platform team docs for onboarding new MFE.

**Test**

- [ ] Fresh clone + Compose works for new contributors.
- [ ] No imports from `../../microfrontends` remain in repo.

---

## Suggested workspace layout (end state)

```text
package.json                 # workspaces root
packages/
  platform-sdk/              # api client, auth hooks, telemetry helpers
  ui-kit/                    # optional shared EUI components
  shell/                     # federation host + layout + routing
  mfe-identity/
  mfe-pics/
  mfe-users/
docker-compose.yml           # shell + mfe-* + api + nginx + database
nginx/                       # routes /mfe/* to services
```

---

## Cross-cutting concerns

### Routing

- Shell owns the browser URL space. Remotes mount under `Route path="pics/*"` etc.; remote internal routes stay relative (`PicsRoutes.jsx` pattern preserved).
- 404 and `/error/:code` remain shell-owned.

### Security

- Remotes are same-origin via nginx in v1 — no extra CORS for federation scripts.
- Do not embed secrets in remote build args; API prefix remains `VITE_PUBLIC_API_PREFIX`.

### Performance

- Lazy load remotes on route enter (keep current UX with `Suspense`).
- Cache `remoteEntry.js` with short TTL or versioned path; long cache for hashed chunks.

### Developer experience

- Document minimum ports: shell `5173`, identity `5000`, pics `5001`, users `5002` (example).
- Provide `npm run dev --workspace=@elaspic/shell` plus concurrent remotes script.

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| React/EUI version mismatch | Federation `shared` + root `overrides`; CI check before publish |
| Breaking remote contract | Semver + manifest compatibility field; integration smoke in shell CI |
| Partial deploy breaks app | Manifest + health check per remote; feature flags to disable a remote |
| Shared component churn | ui-kit owned by platform; semver and changelog |
| Slower first paint | Preload remote on login success for likely destination (`/pics`) — optional optimization |

---

## Definition of done (program level)

- [ ] Each feature team has its own package, build, Docker image (or artifact), and CI workflow.
- [ ] Shell can run with remotes loaded from environment-specific URLs.
- [ ] At least one successful **pics-only** production deploy demonstrated without shell redeploy.
- [ ] Documentation and CODEOWNERS reflect team boundaries.
- [ ] Telemetry plan remains valid (single RUM, team attributes on routes).

---

## Open questions for stakeholders

Use workshop notes to fill in concrete choices:

1. **ui-kit scope:** which `components/` are shared vs owned by one MFE?
2. **Manifest runtime vs build-time:** should shell fetch remote URLs at startup (runtime) or only at build (simpler, less flexible)?
3. **Who approves breaking changes** to `@elaspic/platform-sdk`?
4. **Production hosting:** Compose-only for labs vs CDN + K8s for real environments (affects Phase 5–6).

---

## References

- Current routing and lazy loading: `ui/src/App.jsx`
- UI architecture today: `ui/README.md`
- Team / telemetry boundaries: `INSTRUMENTATION_PLAN.md`
- Stack orchestration: `docker-compose.yml`, `nginx/nginx.conf.template`