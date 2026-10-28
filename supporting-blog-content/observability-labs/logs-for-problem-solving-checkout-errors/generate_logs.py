#!/usr/bin/env python3
"""Write the checkout-api log file used in the article.

Three hours of structured JSON logs (2026-09-11 16:30 to 19:30 UTC) from four replicas of
checkout-api in Kubernetes. At 18:11:56 UTC a canary of version 2.14.1 replaces one replica.
It loads payment_gateway.timeout_ms=1500, and from 18:12:09.842 UTC the payment gateway's slow
tail turns into PaymentGatewayTimeout errors on that pod only.

The output is deterministic (fixed seed and fixed totals), so the numbers in the article
always match:

    137,306 lines | 857 errors = 676 PaymentGatewayTimeout + 117 OutOfStock + 64 PaymentGatewayError

    python3 generate_logs.py                 # writes data/checkout-api.log
    python3 generate_logs.py --out other.log
"""

import argparse
import json
import pathlib
import random
from datetime import datetime, timedelta, timezone

SEED = 20260911
START = datetime(2026, 9, 11, 16, 30, tzinfo=timezone.utc)
END = datetime(2026, 9, 11, 19, 30, tzinfo=timezone.utc)
TOTAL_LINES = 137_306

# The canary replaces pod 4hj6r: that pod stops at CANARY_REPLACES, the canary starts at CANARY_START.
CANARY_REPLACES = datetime(2026, 9, 11, 18, 11, 50, 214000, tzinfo=timezone.utc)
CANARY_START = datetime(2026, 9, 11, 18, 11, 56, tzinfo=timezone.utc)
CANARY_TRAFFIC = datetime(2026, 9, 11, 18, 12, 10, 897000, tzinfo=timezone.utc)
FIRST_TIMEOUT = datetime(2026, 9, 11, 18, 12, 9, 842000, tzinfo=timezone.utc)

CANARY = "checkout-api-7f8b9c6d4-x9k2p"
PODS = {
    # pod name: (version, first line, last line)
    "checkout-api-6c9d4b7f5-9ml2t": ("2.14.0", START, END),
    "checkout-api-6c9d4b7f5-2kq8p": ("2.14.0", START, END),
    "checkout-api-6c9d4b7f5-7xn4n": ("2.14.0", START, END),
    "checkout-api-6c9d4b7f5-4hj6r": ("2.14.0", START, CANARY_REPLACES),
    CANARY: ("2.14.1", CANARY_TRAFFIC, END),
}

# Fixed error counts per pod (they add up to the totals in the article).
TIMEOUTS = 676  # all on the canary, the first one is FIRST_TIMEOUT
OUT_OF_STOCK = {"9ml2t": 41, "2kq8p": 29, "7xn4n": 27, "4hj6r": 13, "x9k2p": 7}  # 117
GATEWAY_ERRORS = {"9ml2t": 18, "2kq8p": 17, "7xn4n": 15, "4hj6r": 9, "x9k2p": 5}  # 64

CHECKOUTS_PER_MINUTE = 35  # per pod
SLOW_SHARE = 0.25  # share of payments slower than 1,500 ms (the gateway's slow tail)


def iso(ts):
    return ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"


class Logs:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.lines = []

    def emit(self, ts, level, message, pod, **fields):
        version = PODS[pod][0]
        record = {
            "time": iso(ts),
            "level": level,
            "message": message,
            "service.name": "checkout-api",
            "service.version": version,
            "k8s.namespace.name": "shop",
            "k8s.deployment.name": "checkout-api",
            "k8s.pod.name": pod,
        }
        record.update(fields)
        self.lines.append((ts, record))

    def order(self):
        return f"o-{self.rng.getrandbits(24):06x}"

    def cart(self):
        return f"c-{self.rng.randint(10000, 99999)}"

    def gateway(self):
        return "stripe-eu" if self.rng.random() < 0.7 else "stripe-us"

    def instant(self, start, end):
        span = (end - start).total_seconds()
        return start + timedelta(milliseconds=round(self.rng.uniform(0, span) * 1000))


def canary_startup(logs):
    """The canary's first lines, exactly as in the surrounding documents screenshot."""
    t = CANARY_START
    steps = [
        (0.000, "INFO", "Starting checkout-api 2.14.1 (build 8c1f2a9)", {}),
        (
            0.180,
            "INFO",
            "Loaded configuration: payment_gateway.timeout_ms=1500, payment_gateway.retries=3, feature.fast_capture=true",
            {},
        ),
        (0.410, "INFO", "Connected to payment gateway pool (stripe-eu, stripe-us)", {}),
        (0.630, "INFO", "Listening on :8080", {}),
        (1.980, "INFO", "Readiness probe passed, receiving traffic", {}),
        (4.461, "INFO", "Health check ok", {"url.path": "/healthz"}),
        (
            12.342,
            "WARN",
            "Retrying payment capture for order o-93c930 (attempt 2/3, gateway=stripe-eu)",
            {
                "url.path": "/api/checkout/confirm",
                "http.request.method": "POST",
                "order.id": "o-93c930",
            },
        ),
        (
            13.842,
            "ERROR",
            "Payment gateway timeout after 1500 ms for order o-93c930 (gateway=stripe-eu)",
            {
                "url.path": "/api/checkout/confirm",
                "http.request.method": "POST",
                "http.response.status_code": 504,
                "error.type": "PaymentGatewayTimeout",
                "order.id": "o-93c930",
            },
        ),
        (14.731, "INFO", "Health check ok", {"url.path": "/healthz"}),
        (
            14.897,
            "INFO",
            "Checkout started for cart c-91897, order o-a92f15 created",
            {
                "url.path": "/api/checkout/start",
                "http.request.method": "POST",
                "order.id": "o-a92f15",
            },
        ),
    ]
    for offset, level, message, fields in steps:
        logs.emit(t + timedelta(seconds=offset), level, message, CANARY, **fields)
    return 1, 1  # one timeout and one checkout already written


def health_checks(logs, pod, start, end, first=None):
    t = first or start + timedelta(milliseconds=logs.rng.randint(0, 9999))
    while t < end:
        logs.emit(t, "INFO", "Health check ok", pod, **{"url.path": "/healthz"})
        t += timedelta(milliseconds=10_000 + logs.rng.randint(-60, 60))


def checkouts(logs, pod, start, end, timeouts=0):
    """Cart, checkout start and payment capture for each checkout. Returns the timeouts written."""
    minutes = (end - start).total_seconds() / 60
    count = round(minutes * CHECKOUTS_PER_MINUTE)
    canary = pod == CANARY
    starts = sorted(
        logs.instant(start, end - timedelta(seconds=12)) for _ in range(count)
    )
    # The slow tail is steady, so the canary's timeouts are spread evenly over its checkouts.
    stride = count / timeouts if timeouts else 0
    timeout_slots = (
        {int(k * stride) + logs.rng.randrange(int(stride)) for k in range(timeouts)}
        if canary
        else set()
    )
    for i, t in enumerate(starts):
        cart, order, gw = logs.cart(), logs.order(), logs.gateway()
        items = logs.rng.randint(1, 6)
        logs.emit(
            t,
            "INFO",
            f"Cart {cart} loaded with {items} items",
            pod,
            **{"url.path": "/api/cart", "http.request.method": "GET"},
        )
        t += timedelta(milliseconds=logs.rng.randint(400, 2500))
        logs.emit(
            t,
            "INFO",
            f"Checkout started for cart {cart}, order {order} created",
            pod,
            **{
                "url.path": "/api/checkout/start",
                "http.request.method": "POST",
                "order.id": order,
            },
        )
        t += timedelta(milliseconds=logs.rng.randint(300, 1500))
        confirm = {
            "url.path": "/api/checkout/confirm",
            "http.request.method": "POST",
            "order.id": order,
        }
        if canary:
            if i in timeout_slots:
                # The first attempt hits the 1,500 ms timeout, the retry hits it again.
                t += timedelta(milliseconds=1500)
                logs.emit(
                    t,
                    "WARN",
                    f"Retrying payment capture for order {order} (attempt 2/3, gateway={gw})",
                    pod,
                    **confirm,
                )
                t += timedelta(milliseconds=1500)
                logs.emit(
                    t,
                    "ERROR",
                    f"Payment gateway timeout after 1500 ms for order {order} (gateway={gw})",
                    pod,
                    **confirm,
                    **{
                        "http.response.status_code": 504,
                        "error.type": "PaymentGatewayTimeout",
                    },
                )
                continue
            latency = logs.rng.randint(80, 1490)
        else:
            slow = logs.rng.random() < SLOW_SHARE
            latency = (
                round(min(4800, 1501 + logs.rng.expovariate(1 / 700)))
                if slow
                else logs.rng.randint(80, 1490)
            )
            if slow:
                t += timedelta(milliseconds=latency)
                logs.emit(
                    t,
                    "WARN",
                    f"Payment gateway slow: {latency} ms for order {order} (gateway={gw})",
                    pod,
                    **confirm,
                    **{"payment.latency_ms": latency},
                )
        t += timedelta(milliseconds=latency if canary else 20)
        amount = logs.rng.randint(1200, 25000) / 100
        logs.emit(
            t,
            "INFO",
            f"Payment captured for order {order}: {amount:.2f} EUR (gateway={gw})",
            pod,
            **confirm,
            **{"http.response.status_code": 200},
        )
    return len(timeout_slots)


def background_errors(logs, pod, start, end):
    short = pod.rsplit("-", 1)[1]
    for _ in range(OUT_OF_STOCK[short]):
        t = logs.instant(start, end)
        sku, order = logs.rng.randint(10000, 99999), logs.order()
        logs.emit(
            t,
            "ERROR",
            f"Inventory reservation failed for SKU {sku}: out of stock (order {order})",
            pod,
            **{
                "url.path": "/api/checkout/start",
                "http.request.method": "POST",
                "http.response.status_code": 409,
                "error.type": "OutOfStock",
                "order.id": order,
            },
        )
    for _ in range(GATEWAY_ERRORS[short]):
        t = logs.instant(start, end)
        order, gw = logs.order(), logs.gateway()
        logs.emit(
            t,
            "ERROR",
            f"Upstream error from payment gateway for order {order}: HTTP 503 (gateway={gw})",
            pod,
            **{
                "url.path": "/api/checkout/payment-intent",
                "http.request.method": "POST",
                "http.response.status_code": 502,
                "error.type": "PaymentGatewayError",
                "order.id": order,
            },
        )


def generate():
    logs = Logs(SEED)
    timeouts, _ = canary_startup(logs)
    for pod, (_, start, end) in PODS.items():
        if pod == CANARY:
            health_checks(
                logs,
                pod,
                start,
                end,
                first=datetime(2026, 9, 11, 18, 12, 20, 731000, tzinfo=timezone.utc),
            )
            timeouts += checkouts(logs, pod, start, end, timeouts=TIMEOUTS - 1)
        else:
            health_checks(logs, pod, start, end)
            checkouts(logs, pod, start, end)
        background_errors(logs, pod, start, end)

    # Fill up to TOTAL_LINES with cart views (customers browsing without checking out).
    missing = TOTAL_LINES - len(logs.lines)
    if missing < 0:
        raise SystemExit(f"too many lines: {len(logs.lines)}")
    total_weight = sum((e - s).total_seconds() for _, s, e in PODS.values())
    remaining = missing
    for n, (pod, (_, start, end)) in enumerate(PODS.items()):
        share = (
            remaining
            if n == len(PODS) - 1
            else round(missing * (end - start).total_seconds() / total_weight)
        )
        remaining -= share
        for _ in range(share):
            t = logs.instant(start, end)
            logs.emit(
                t,
                "INFO",
                f"Cart {logs.cart()} loaded with {logs.rng.randint(1, 6)} items",
                pod,
                **{"url.path": "/api/cart", "http.request.method": "GET"},
            )

    logs.lines.sort(key=lambda item: item[0])
    assert len(logs.lines) == TOTAL_LINES, len(logs.lines)
    assert all(START <= ts < END for ts, _ in logs.lines)
    assert timeouts == TIMEOUTS
    return [record for _, record in logs.lines]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=str(pathlib.Path(__file__).with_name("data") / "checkout-api.log"),
    )
    args = ap.parse_args()
    records = generate()
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w") as f:
        for record in records:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")
    errors = [r for r in records if r["level"] == "ERROR"]
    by_type = {}
    for r in errors:
        by_type[r["error.type"]] = by_type.get(r["error.type"], 0) + 1
    print(f"wrote {out}: {len(records):,} lines, {len(errors)} errors {by_type}")


if __name__ == "__main__":
    main()
