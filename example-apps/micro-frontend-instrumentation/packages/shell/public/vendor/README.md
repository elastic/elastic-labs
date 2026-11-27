# EDOT Browser bundle (vendored)

Committed copy of `@elastic/opentelemetry-browser` **`elastic-otel-browser.min.js`**. Not installed via npm.

Current version: see `EDOT_BROWSER_VERSION`.

## Team processors IIFE

`mfe-telemetry-processors.iife.js` is **generated** — do not edit by hand. Rebuild with:

```bash
npm run build -w @mfe/telemetry
```

## Upgrade EDOT bundle

1. Download `build/elastic-otel-browser.min.js` for the target release from [npm](https://www.npmjs.com/package/@elastic/opentelemetry-browser) or [EDOT release notes](https://www.elastic.co/docs/release-notes/edot/sdks/rum).
2. Replace `elastic-otel-browser.min.js` and bump `EDOT_BROWSER_VERSION`.
3. Run Step 2+ smoke tests in `INSTRUMENTATION_PLAN.md` and verify `installTeamProcessors()` if already enabled.