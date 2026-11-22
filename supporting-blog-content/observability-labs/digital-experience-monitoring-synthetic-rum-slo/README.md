# Digital experience monitoring with three signals: companion lab

Companion files for the Observability Labs article on digital experience monitoring with a synthetic journey, real user monitoring (RUM) and service level objectives (SLOs) on one checkout flow.

The lab runs Bean Box, the sample coffee shop from the [synthetic monitoring](https://www.elastic.co/observability-labs/blog/synthetic-monitoring-checkout-alerts-slo) and [real user monitoring](https://www.elastic.co/observability-labs/blog/real-user-monitoring-opentelemetry-sampling) articles, with all three signals pointed at the same checkout:

- A Synthetics browser journey that buys a coffee with the payment provider's 4242 test card, every 3 minutes, from two managed locations and one Private Location.
- EDOT Browser in every page (RUM), exporting through the shop's own `/otlp/` route.
- EDOT Node.js on the server (APM), behind an EDOT Collector with the `elasticapm` connector.
- Three SLOs, one per signal, each with a burn rate rule.

A scenario script then switches on six faults, one at a time, while Playwright replays simulated visitors, and finally reruns two of them (the campaign image and the Safari bug) to check the SLO and rule added after them.

Tested with Elastic Cloud Hosted 9.5.6, EDOT Collector 9.5.6, `@elastic/opentelemetry-node` 1.20.1, `@elastic/opentelemetry-browser` 0.4.0, `@elastic/synthetics` 1.29.0, Playwright 1.64.1 and Node.js 24.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Bean Box. `telemetry.js` starts EDOT Node.js and skips transactions for `/otlp/`, `/static/` and health routes. `server.js` serves the shop, forwards `/otlp/` to the collector with a bearer token, and runs a live payment gateway and a sandbox gateway (cards starting with `4242`). `POST /__chaos` (bearer `CHAOS_TOKEN`) switches the faults. `checkout-v2.js` is the Chromium-only checkout build. |
| `collector/` | EDOT Collector config (OTLP/HTTP with `bearertokenauth`, `elasticapm` processor and connector, `elasticsearch` exporter) and a Dockerfile that bakes it into the 9.5.6 image. The `resource/namespace` processor is lab-only. |
| `synthetics/` | Synthetics project `bean-box-dem` with the checkout journey. |
| `slos/` | The three SLO definitions and the burn rate rule template (Kibana API request bodies). |
| `traffic/visit.mjs` | Playwright visitors: six device profiles across Chromium and WebKit, bounce, browse or buy. |
| `traffic/check-checkout.mjs` | Opens the checkout in Chromium and WebKit (Safari's engine) and prints page errors and whether the Place order button is usable. The article's terminal screenshot for the Safari-only bug. |
| `scenario.py` | Switches the six faults and the two reruns on a fixed schedule and logs each switch. |

## Faults

| Switch | Effect |
| --- | --- |
| `gateway_hang` | The live payment gateway stops answering. Orders time out after 5 s and return 502. |
| `campaign_banner` | Screens up to 600 px wide get a 3 MB, 1800x1800 campaign image as the hero. |
| `sandbox_down` | The payment sandbox refuses connections. Only test cards (`4242...`) use it. |
| `slow_orders_rate` | That share of orders waits 2 to 4 s at the live gateway, then succeeds. |
| `checkout_build: "v2"` | Serves `checkout-v2.js`, which enables the Place order button with `scheduler.postTask()`. Safari doesn't have it. |

S6 switches `gateway_hang` and `sandbox_down` on together. The extra SLO (`slos/rum-mobile-lcp.json`) and the browser-errors rule (`slos/browser-errors-rule.json`) are the changes the article makes after S2 and S5; `scenario.py` reruns those two faults at the end.

## Run it

1. Deploy the collector and the shop where the managed Synthetics locations can reach the shop. The lab used two Railway services; any host with a public HTTPS URL works.

   ```bash
   # collector: ELASTIC_ENDPOINT, ELASTIC_API_KEY (write access to logs-*, traces-*, metrics-*), COLLECTOR_TOKEN
   docker build -t dem-collector collector/
   # shop: COLLECTOR_URL=http://<collector>:4318, COLLECTOR_TOKEN, CHAOS_TOKEN, and the EDOT Node.js variables:
   #   OTEL_SERVICE_NAME=bean-box-shop
   #   OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector>:4318
   #   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<COLLECTOR_TOKEN>
   #   OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=dem-lab,service.version=2.0.0
   docker build -t bean-box app/
   ```

2. Apply the Web Vitals mapping from the RUM article (`logs-otel@custom`, `attributes.browser.web_vital.value` as `double`) before any browser data arrives.
3. Put the shop URL in `synthetics/synthetics.config.ts`, then push the journey with a Synthetics project API key:

   ```bash
   cd synthetics && npm ci
   KIBANA_URL=https://<deployment>.kb.<region>.cloud.es.io SYNTHETICS_API_KEY=<key> npx @elastic/synthetics push
   ```

4. Create the SLOs and burn rate rules in Kibana Dev Tools (`POST kbn:/api/observability/slos` with each file in `slos/`, then `POST kbn:/api/alerting/rule` with the template, `__SLO_ID__` and `__NAME__` replaced). Or create them in **Observability > SLOs** and keep the default burn rate rule.
5. Start the visitors and the scenario at the same time:

   ```bash
   cd traffic && npm ci && npx playwright install chromium webkit
   node visit.mjs --url https://<shop> --workers 3 --minutes 500 --log visits.ndjson &
   cd .. && SHOP_URL=https://<shop> CHAOS_TOKEN=<token> T0=<now, UTC> python3 scenario.py
   ```

   The schedule takes about 8 hours. `TIME_SCALE=0.25` runs it in about 2 hours (shorter fault windows). Give the notebook the same value as `LAB_TIME_SCALE`.

6. Open `digital-experience-monitoring-synthetic-rum-slo.ipynb` with `LAB_T0` set to the same `T0`. It creates the SLOs and rules and reproduces each failure with ES|QL.

## Check the checkout in two browser engines

With `checkout_build: "v2"` switched on, run the browser check from `traffic/`:

```bash
cd traffic && node check-checkout.mjs https://<shop>
```

Chromium reports the button as enabled. WebKit prints `ReferenceError: Can't find variable: scheduler` and reports it as disabled.

## Clean up

Delete the monitor (remove the journey and push, or delete it in **Synthetics > Management**), the three SLOs and their rules, the shop and collector deployments, and the `*-generic.otel-dem` and `metrics-*.1m.otel-dem` data streams.
