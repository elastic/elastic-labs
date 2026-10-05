// k6 probe for the NGINX service: about one request per second, exported through OpenTelemetry.
// Every request carries test-id and (from k6 itself) status as tags, which the OpenTelemetry
// output exports as metric attributes. A refused connection is a status of 0. See lab.sh.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  duration: __ENV.PROBE_DURATION || "3h",
  tags: {
    "test-id": __ENV.TEST_ID || "node-pressure-v2",
  },
};

const TARGET = __ENV.TARGET_URL || "http://localhost:30080/";

export default function () {
  const res = http.get(TARGET, { timeout: "2s" });
  check(res, { "HTTP 200": (r) => r.status === 200 });
  sleep(1);
}
