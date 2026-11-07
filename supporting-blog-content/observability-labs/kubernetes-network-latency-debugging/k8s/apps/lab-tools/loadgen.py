"""Open-loop load: starts RATE requests per second whatever the latency, like real users."""

import os
import threading
import time
import urllib.request

URL = os.getenv("TARGET_URL", "http://checkout:8080/checkout")
RATE = float(os.getenv("RATE", "5"))


def hit():
    try:
        with urllib.request.urlopen(URL, timeout=8) as response:
            response.read()
    except Exception:
        pass


next_start = time.monotonic()
while True:
    threading.Thread(target=hit, daemon=True).start()
    next_start += 1 / RATE
    time.sleep(max(0.0, next_start - time.monotonic()))
