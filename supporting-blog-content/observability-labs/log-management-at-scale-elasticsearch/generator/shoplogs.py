#!/usr/bin/env python3
"""Write realistic log files for a small online shop, so a collector can tail them.

Four services, four formats:
  storefront    nginx "combined" access log plus request time and request id
  orders        plain-text application log with key=value pairs
  billing       plain-text application log; can produce a retry storm (--storm-at)
  stock-worker  health checks and DEBUG cache refreshes: high volume, low value

Usage:
  python3 shoplogs.py --out ./logs --rate 2000 --minutes 100 --storm-at 60 --storm-minutes 10

No third-party dependencies. Files are rotated by size so the collector's
filelog receiver sees a realistic rotation pattern.
"""
import argparse
import math
import os
import random
import string
import time
from datetime import datetime, timezone

SERVICES = {
    # share of total lines when no storm is running
    "storefront": 0.44,
    "orders": 0.10,
    "billing": 0.06,
    "stock-worker": 0.40,
}

PATHS = [
    "/",
    "/search",
    "/cart",
    "/checkout",
    "/account",
    "/products/sku-{sku}",
    "/products/sku-{sku}/reviews",
    "/api/cart/items",
    "/api/recommendations?sku=sku-{sku}",
    "/static/app.{h}.js",
    "/static/app.{h}.css",
    "/images/sku-{sku}-{n}.jpg",
]
UAS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
    "kube-probe/1.34",
]
REFERERS = [
    "-",
    "https://shop.example/",
    "https://shop.example/search?q=boots",
    "https://www.google.com/",
    "https://shop.example/cart",
]
DECLINES = ["insufficient_funds", "card_expired", "do_not_honor", "suspected_fraud"]


def rid(n=16):
    return "".join(random.choices("0123456789abcdef", k=n))


def ip():
    # documentation ranges only
    net = random.choice(["203.0.113", "198.51.100", "192.0.2"])
    return f"{net}.{random.randint(1, 254)}"


def sku():
    # zipf-ish popularity: a few hot products, a long tail
    return int(random.paretovariate(1.2) * 1000) % 90000 + 10000


def storefront(now):
    p = random.choice(PATHS).format(sku=sku(), h=rid(8), n=random.randint(1, 6))
    method = "POST" if p.startswith("/api/cart") and random.random() < 0.6 else "GET"
    status = random.choices(
        [200, 200, 200, 304, 301, 404, 499, 500, 502],
        weights=[70, 10, 5, 6, 2, 4, 1, 1, 1],
    )[0]
    size = 0 if status in (304, 499) else random.randint(300, 90000)
    rt = round(random.lognormvariate(-3.2, 0.9), 3)
    ts = now.strftime("%d/%b/%Y:%H:%M:%S +0000")
    return (
        f'{ip()} - - [{ts}] "{method} {p} HTTP/1.1" {status} {size} '
        f'"{random.choice(REFERERS)}" "{random.choice(UAS)}" rt={rt} req_id={rid(32)}'
    )


def app_ts(now):
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def orders(now):
    r = random.random()
    oid, uid = f"ord_{rid(12)}", f"u_{random.randint(1, 250000)}"
    if r < 0.55:
        return (
            f"{app_ts(now)} INFO  [orders-api] order placed order_id={oid} user_id={uid} "
            f"items={random.randint(1, 7)} total={random.randint(500, 40000) / 100:.2f} trace_id={rid(32)}"
        )
    if r < 0.85:
        return (
            f"{app_ts(now)} INFO  [orders-api] order status changed order_id={oid} "
            f"from=paid to={random.choice(['packed', 'shipped', 'delivered'])}"
        )
    if r < 0.97:
        return (
            f"{app_ts(now)} WARN  [orders-api] slow query took_ms={random.randint(800, 4000)} "
            f"query=orders_by_user user_id={uid}"
        )
    # multi-line error: the two stack lines arrive as separate log records unless the shipper joins them
    return (
        f"{app_ts(now)} ERROR [orders-api] failed to reserve stock order_id={oid} "
        f"sku=sku-{sku()} reason=timeout trace_id={rid(32)}\n"
        f"java.util.concurrent.TimeoutException: stock service did not answer in 2000 ms\n"
        f"\tat shop.orders.StockClient.reserve(StockClient.java:88)"
    )


def billing(now, storm=False):
    if storm and random.random() < 0.97:
        return (
            f"{app_ts(now)} WARN  [billing] retrying ledger connection attempt={random.randint(1, 12)} "
            f"backoff_ms={random.choice([100, 200, 400, 800, 1600])} peer=ledger-{random.randint(0, 2)}:5432 "
            f"charge_id=ch_{rid(14)}"
        )
    r = random.random()
    if r < 0.8:
        return (
            f"{app_ts(now)} INFO  [billing] charge authorized charge_id=ch_{rid(14)} "
            f"amount={random.randint(500, 40000) / 100:.2f} currency=USD provider=acme-pay"
        )
    if r < 0.97:
        return (
            f"{app_ts(now)} WARN  [billing] charge declined charge_id=ch_{rid(14)} "
            f"reason={random.choice(DECLINES)}"
        )
    return f"{app_ts(now)} ERROR [billing] webhook delivery failed endpoint=/hooks/payment status=503"


def stock_worker(now):
    r = random.random()
    if r < 0.62:
        return f"{app_ts(now)} INFO  [stock-worker] GET /healthz 200 {random.randint(1, 9) / 10:.1f}ms"
    if r < 0.995:
        return (
            f"{app_ts(now)} DEBUG [stock-worker] cache refresh sku=sku-{sku()} "
            f"warehouse=wh-{random.randint(1, 12)} qty={random.randint(0, 400)}"
        )
    return f"{app_ts(now)} INFO  [stock-worker] reconciled skus={random.randint(900, 1400)} took_ms={random.randint(200, 900)}"


class RotatingFile:
    def __init__(self, path, max_bytes=64 * 1024 * 1024, keep=3):
        self.path, self.max_bytes, self.keep = path, max_bytes, keep
        self.f = open(path, "a", buffering=1024 * 1024)

    def write(self, line):
        self.f.write(line + "\n")
        if self.f.tell() > self.max_bytes:
            self.f.close()
            for i in range(self.keep - 1, 0, -1):
                if os.path.exists(f"{self.path}.{i}"):
                    os.replace(f"{self.path}.{i}", f"{self.path}.{i + 1}")
            os.replace(self.path, f"{self.path}.1")
            self.f = open(self.path, "a", buffering=1024 * 1024)

    def flush(self):
        self.f.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./logs")
    ap.add_argument(
        "--rate", type=int, default=2000, help="average lines per second, all services"
    )
    ap.add_argument("--minutes", type=float, default=100)
    ap.add_argument(
        "--storm-at",
        type=float,
        default=-1,
        help="minute when billing starts a retry storm",
    )
    ap.add_argument("--storm-minutes", type=float, default=10)
    ap.add_argument(
        "--storm-factor",
        type=float,
        default=15,
        help="billing volume multiplier during the storm",
    )
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    files = {s: RotatingFile(os.path.join(a.out, f"{s}.log")) for s in SERVICES}
    makers = {"storefront": storefront, "orders": orders, "stock-worker": stock_worker}
    start = time.time()
    tick = 0.2
    written = 0
    while (elapsed := time.time() - start) < a.minutes * 60:
        minute = elapsed / 60
        # gentle traffic wave so volume charts are not flat
        wave = 1 + 0.2 * math.sin(minute / 9) + random.uniform(-0.05, 0.05)
        storm = a.storm_at >= 0 and a.storm_at <= minute < a.storm_at + a.storm_minutes
        for svc, share in SERVICES.items():
            n = a.rate * share * wave * tick
            if svc == "billing" and storm:
                n *= a.storm_factor
            n = int(n) + (1 if random.random() < n - int(n) else 0)
            for _ in range(n):
                now = datetime.now(timezone.utc)
                line = billing(now, storm) if svc == "billing" else makers[svc](now)
                files[svc].write(line)
                written += 1
        for f in files.values():
            f.flush()
        sleep = tick - ((time.time() - start) - elapsed)
        if sleep > 0:
            time.sleep(sleep)
    print(f"done: {written} lines in {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
