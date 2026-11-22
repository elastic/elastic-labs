"""Injects the five faults of the digital experience lab on a fixed schedule.

Every fault is switched on and off through the shop's POST /__chaos endpoint, and every
switch is written to the event log with its UTC time, so each disagreement can be matched
to the fault that caused it.

Usage:
  SHOP_URL=https://<shop> CHAOS_TOKEN=<token> T0=2026-11-15T00:00:00Z python3 scenario.py
"""

import datetime as dt
import json
import os
import sys
import time
import urllib.request

SHOP = os.environ["SHOP_URL"].rstrip("/")
TOKEN = os.environ["CHAOS_TOKEN"]
T0 = dt.datetime.fromisoformat(os.environ["T0"].replace("Z", "+00:00"))
LOG = os.environ.get("LOG", "scenario-events.log")
FROM_MINUTE = int(os.environ.get("FROM_MINUTE", "0"))  # resume a schedule part-way
TIME_SCALE = float(
    os.environ.get("TIME_SCALE", "1")
)  # e.g. 0.25 runs the schedule 4 times faster

# (minutes after T0, change, note). Quiet periods between faults let every signal recover.
SCHEDULE = [
    (0, {}, "run start: no faults"),
    (45, {"gateway_hang": True}, "S1 on: live payment gateway stops answering"),
    (75, {"gateway_hang": False}, "S1 off"),
    (
        105,
        {"campaign_banner": True},
        "S2 on: 3 MB campaign image as the hero on small screens",
    ),
    (145, {"campaign_banner": False}, "S2 off"),
    (175, {"sandbox_down": True}, "S3 on: payment sandbox (test cards) down"),
    (205, {"sandbox_down": False}, "S3 off"),
    (235, {"slow_orders_rate": 0.3}, "S4 on: 30% of orders take 2-4 s at the gateway"),
    (275, {"slow_orders_rate": 0}, "S4 off"),
    (305, {"checkout_build": "v2"}, "S5 on: checkout v2 (scheduler.postTask) released"),
    (345, {"checkout_build": "v1"}, "S5 off: rolled back to checkout v1"),
    (
        375,
        {"gateway_hang": True, "sandbox_down": True},
        "S6 on: whole payment provider down (live gateway hangs, sandbox refuses)",
    ),
    (405, {"gateway_hang": False, "sandbox_down": False}, "S6 off"),
    (415, {"campaign_banner": True}, "S2 again, with the LCP SLO in place"),
    (455, {"campaign_banner": False}, "S2 again off"),
    (465, {"checkout_build": "v2"}, "S5 again, with the browser-errors rule in place"),
    (485, {"checkout_build": "v1"}, "S5 again off"),
    (495, {}, "run end"),
]


def chaos(change, note):
    body = json.dumps({**change, "note": note}).encode()
    req = urllib.request.Request(
        f"{SHOP}/__chaos",
        data=body,
        method="POST",
        headers={
            "authorization": f"Bearer {TOKEN}",
            "content-type": "application/json",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)["chaos"]
        except Exception as e:  # retry: a missed switch would corrupt the run
            print(f"chaos call failed ({e}), retrying", file=sys.stderr)
            time.sleep(5)
    raise SystemExit("could not reach the shop")


def main():
    for minute, change, note in SCHEDULE:
        if minute < FROM_MINUTE:
            continue
        at = T0 + dt.timedelta(minutes=minute * TIME_SCALE)
        wait = (at - dt.datetime.now(dt.timezone.utc)).total_seconds()
        if wait > 0:
            time.sleep(wait)
        state = chaos(change, note)
        line = {
            "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "minute": minute,
            "note": note,
            "chaos": state,
        }
        with open(LOG, "a") as f:
            f.write(json.dumps(line) + "\n")
        print(json.dumps(line), flush=True)


if __name__ == "__main__":
    main()
