"""Open-loop load: starts RATE orders per second whatever the latency, like real users.
80% of the orders are in USD, 10% in EUR and 10% in GBP."""

import os
import random
import threading
import time
import urllib.request

URL = os.getenv("TARGET_URL", "http://orders:8080/orders")
RATE = float(os.getenv("RATE", "8"))
CURRENCIES = ["USD", "EUR", "GBP"]
WEIGHTS = [80, 10, 10]


def hit():
    currency = random.choices(CURRENCIES, WEIGHTS)[0]
    try:
        with urllib.request.urlopen(
            f"{URL}?currency={currency}", timeout=5
        ) as response:
            response.read()
    except Exception:
        pass  # 500s from orders 1.5.0 are expected


next_start = time.monotonic()
while True:
    threading.Thread(target=hit, daemon=True).start()
    next_start += 1 / RATE
    time.sleep(max(0.0, next_start - time.monotonic()))
