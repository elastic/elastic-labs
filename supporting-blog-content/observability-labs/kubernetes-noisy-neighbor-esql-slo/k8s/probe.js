// k6 probe for the storefront. One request at a time with a 200 ms pause.
// Every request carries tenant, test-id and (from k6 itself) status as tags, which the
// OpenTelemetry output exports as metric attributes. See lab.sh for the environment.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  duration: __ENV.PROBE_DURATION || "30m",
  tags: {
    tenant: "storefront",
    "test-id": __ENV.TEST_ID || "noisy-neighbor-final",
  },
  thresholds: {
    "http_req_duration{tenant:storefront}": ["p(95)<500"],
  },
};

const TARGET = __ENV.STOREFRONT_URL || "http://localhost:30080/export.bin";

export default function () {
  const res = http.get(TARGET, { headers: { "Accept-Encoding": "gzip" } });
  check(res, { "HTTP 200 under 500 ms": (r) => r.status === 200 && r.timings.duration < 500 });
  sleep(0.2);
}
