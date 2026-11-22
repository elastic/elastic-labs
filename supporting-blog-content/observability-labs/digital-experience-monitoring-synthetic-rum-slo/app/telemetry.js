// Starts EDOT Node before the app (npm start = node --require ./telemetry.js server.js).
// Same as `--require @elastic/opentelemetry-node`, plus one change: requests that are not
// shop traffic (browser telemetry forwarded to the collector, static files, health checks)
// don't create transactions.
const { startNodeSDK, getInstrumentations } = require('@elastic/opentelemetry-node/sdk');

const notShopTraffic = (req) => /^\/(otlp|static)\/|^\/(health|__chaos|__events)$/.test(req.url || '');

startNodeSDK({
  instrumentations: getInstrumentations({
    '@opentelemetry/instrumentation-http': { ignoreIncomingRequestHook: notShopTraffic },
    '@opentelemetry/instrumentation-undici': { requireParentforSpans: true },
  }),
});
