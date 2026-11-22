"""Starlink dish poller: reads dish status and exports it as OpenTelemetry metrics.

Each edge site runs one poller next to its dish. In `dish` mode the poller reads the
dish's local gRPC status API (192.168.100.1:9200) with starlink-grpc-tools. In
`simulate` mode it generates readings for a fleet of six sites, including the
incidents used in the article, so you can follow along without hardware.

Usage:
  uv run starlink_poller.py --mode simulate --minutes 120
  uv run starlink_poller.py --mode simulate --start-minute 98   # continue the notebook's script
  uv run --with starlink-grpc-core starlink_poller.py --mode dish --site warehouse-reno
"""

# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "opentelemetry-sdk==1.38.0",
#   "opentelemetry-exporter-otlp-proto-http==1.38.0",
# ]
# ///

import argparse
import math
import os
import random
import time

from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.metrics import Observation
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

EXPORT_INTERVAL_S = 10
ALERTS = ["thermal_throttle", "is_heating", "motors_stuck", "slow_ethernet_speeds"]

# The seven dish gauges: (metric name, unit, reading key, description, integer value).
# The eighth metric, starlink.dish.alert.active, has one data point per alert name.
GAUGES = [
    (
        "starlink.dish.pop_ping.latency",
        "ms",
        "pop_ping_latency_ms",
        "Round-trip time to the Starlink point of presence",
        False,
    ),
    (
        "starlink.dish.pop_ping.drop_rate",
        "1",
        "pop_ping_drop_rate",
        "Fraction of lost ping replies to the point of presence",
        False,
    ),
    (
        "starlink.dish.downlink.throughput",
        "bit/s",
        "downlink_throughput_bps",
        "Current downlink throughput",
        False,
    ),
    (
        "starlink.dish.uplink.throughput",
        "bit/s",
        "uplink_throughput_bps",
        "Current uplink throughput",
        False,
    ),
    (
        "starlink.dish.obstruction.fraction",
        "1",
        "fraction_obstructed",
        "Fraction of the sky view that is obstructed",
        False,
    ),
    (
        "starlink.dish.obstructed",
        "1",
        "currently_obstructed",
        "1 when the dish is obstructed right now",
        True,
    ),
    ("starlink.dish.power", "W", "power_w", "Power drawn by the dish", False),
]

# One entry per edge site. base_* values describe a normal day at that site.
SITES = {
    "warehouse-reno": dict(
        type="warehouse",
        region="us-west",
        hw="standard",
        lat=27,
        dl=60e6,
        ul=8e6,
        power=58,
    ),
    "farm-iowa": dict(
        type="farm",
        region="us-central",
        hw="standard",
        lat=31,
        dl=25e6,
        ul=4e6,
        power=55,
    ),
    "mine-pilbara": dict(
        type="mine",
        region="ap-southeast",
        hw="standard",
        lat=38,
        dl=40e6,
        ul=12e6,
        power=60,
    ),
    "vessel-north-sea": dict(
        type="vessel",
        region="eu-north",
        hw="flat_high_performance",
        lat=52,
        dl=35e6,
        ul=6e6,
        power=115,
    ),
    "clinic-atacama": dict(
        type="clinic",
        region="sa-west",
        hw="standard",
        lat=44,
        dl=30e6,
        ul=5e6,
        power=57,
    ),
    "station-svalbard": dict(
        type="research_station",
        region="eu-arctic",
        hw="standard",
        lat=47,
        dl=20e6,
        ul=9e6,
        power=56,
    ),
}


class SimulatedDish:
    """Generates status readings for one site, with the article's incidents scripted in."""

    def __init__(self, name, spec, start):
        self.name, self.spec, self.start = name, spec, start
        self.rng = random.Random(name)
        self.walk_dl = 1.0
        self.cache_slot, self.cache = None, None

    def minutes(self):
        return (time.time() - self.start) / 60

    def read(self):
        # One reading per export interval, shared by every metric of the site.
        slot = int(time.time() // EXPORT_INTERVAL_S)
        if slot != self.cache_slot:
            self.cache_slot, self.cache = slot, self._sample()
        return self.cache

    def sample_at(self, ts):
        """Reading at an explicit Unix time, used to backfill history (see the notebook)."""
        return self._sample((ts - self.start) / 60)

    def _sample(self, m=None):
        s, r = self.spec, self.rng
        m = self.minutes() if m is None else m
        self.walk_dl = min(1.4, max(0.5, self.walk_dl + r.gauss(0, 0.05)))
        wave = 1 + 0.25 * math.sin(m / 18)  # slow traffic swing at the site
        latency = s["lat"] + r.gauss(0, 3) + (r.random() < 0.03) * r.uniform(15, 60)
        drop = max(0.0, r.gauss(0.004, 0.003))
        dl = s["dl"] * self.walk_dl * wave * r.uniform(0.85, 1.15)
        ul = s["ul"] * wave * r.uniform(0.8, 1.2)
        power = s["power"] + r.gauss(0, 2)
        obstruction = 0.002 + r.random() * 0.001
        obstructed = 0
        alerts = dict.fromkeys(ALERTS, 0)

        if self.name == "vessel-north-sea":
            # Moving platform: wider latency spread and frequent short drops.
            latency += r.gauss(0, 8)
            drop += r.random() * 0.01

        if self.name == "farm-iowa" and 40 <= m < 58:
            # Heavy rain over the farm: signal fades, pings drop, throughput falls.
            depth = math.sin(math.pi * (m - 40) / 18)
            drop += depth * r.uniform(0.05, 0.18)
            latency += depth * r.uniform(8, 20)
            dl *= 1 - 0.65 * depth
            ul *= 1 - 0.5 * depth

        if self.name == "mine-pilbara" and m >= 20:
            # A new stockpile grows into the dish's field of view.
            obstruction = min(0.06, 0.003 + (m - 20) * 0.0007) + r.random() * 0.002
            if r.random() < obstruction * 6:
                obstructed = 1
                drop += r.uniform(0.25, 0.9)
                dl *= r.uniform(0.1, 0.5)

        if self.name == "clinic-atacama" and 60 <= m < 85:
            # Afternoon heat: the dish throttles itself to protect the electronics.
            alerts["thermal_throttle"] = 1
            dl *= 0.4
            ul *= 0.6
            latency += r.uniform(2, 8)
            power += 6

        if self.name == "station-svalbard" and 30 <= m < 70:
            # Snow on the dish: the heater melts it and power draw almost doubles.
            alerts["is_heating"] = 1
            power += 45 + r.gauss(0, 4)
            drop += r.uniform(0.0, 0.02)

        return dict(
            pop_ping_latency_ms=max(18.0, latency),
            pop_ping_drop_rate=min(1.0, drop),
            downlink_throughput_bps=max(0.0, dl),
            uplink_throughput_bps=max(0.0, ul),
            fraction_obstructed=obstruction,
            currently_obstructed=obstructed,
            power_w=max(0.0, power),
            alerts=alerts,
        )


class GrpcDish:
    """Reads the real dish through starlink-grpc-tools (pip install starlink-grpc-core)."""

    def __init__(self):
        import starlink_grpc  # imported here so simulate mode needs no gRPC stack

        self.grpc = starlink_grpc
        self.ctx = starlink_grpc.ChannelContext()  # defaults to 192.168.100.1:9200
        self.cache_slot, self.cache = None, None

    def read(self):
        slot = int(time.time() // EXPORT_INTERVAL_S)
        if slot != self.cache_slot:
            status, _obstruction, alerts = self.grpc.status_data(context=self.ctx)[0:3]
            # The dish reports power only in its 1-second history buffer.
            _general, bulk = self.grpc.history_bulk_data(1, context=self.ctx)
            power_w = (bulk["power_w"] or [None])[-1]
            self.cache_slot = slot
            self.cache = dict(
                pop_ping_latency_ms=status["pop_ping_latency_ms"],
                pop_ping_drop_rate=status["pop_ping_drop_rate"],
                downlink_throughput_bps=status["downlink_throughput_bps"],
                uplink_throughput_bps=status["uplink_throughput_bps"],
                fraction_obstructed=status["fraction_obstructed"],
                currently_obstructed=int(status["currently_obstructed"]),
                power_w=power_w or 0.0,
                alerts={a: int(bool(alerts.get(f"alert_{a}"))) for a in ALERTS},
            )
        return self.cache


def instrument(dish, site, spec, endpoint, headers):
    """Create one MeterProvider per site, so each site is its own OTel resource."""
    resource = Resource.create(
        {
            "service.name": "starlink-poller",
            "host.name": f"gw-{site}",
            "site.name": site,
            "site.type": spec["type"],
            "site.region": spec["region"],
            "starlink.dish.hardware": spec["hw"],
        }
    )
    exporter = OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics", headers=headers)
    reader = PeriodicExportingMetricReader(
        exporter, export_interval_millis=EXPORT_INTERVAL_S * 1000
    )
    provider = MeterProvider(resource=resource, metric_readers=[reader])
    meter = provider.get_meter("starlink-poller", "1.0.0")

    def gauge(name, unit, key, description):
        meter.create_observable_gauge(
            name,
            unit=unit,
            description=description,
            callbacks=[lambda _opts: [Observation(dish.read()[key])]],
        )

    for name, unit, key, description, _integer in GAUGES:
        gauge(name, unit, key, description)
    meter.create_observable_gauge(
        "starlink.dish.alert.active",
        unit="1",
        description="1 while the named dish alert is active",
        callbacks=[
            lambda _opts: [
                Observation(v, {"alert.name": k})
                for k, v in dish.read()["alerts"].items()
            ]
        ],
    )
    return provider


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["simulate", "dish"], default="simulate")
    parser.add_argument(
        "--site", default="warehouse-reno", help="site name in dish mode"
    )
    parser.add_argument("--minutes", type=float, default=120)
    parser.add_argument(
        "--start-minute",
        type=float,
        default=0,
        help="simulate mode: start the incident script this many minutes in",
    )
    args = parser.parse_args()

    endpoint = os.environ.get("OTLP_ENDPOINT", "http://localhost:14318")
    headers = {"Authorization": f"Bearer {os.environ['COLLECTOR_TOKEN']}"}
    start = time.time() - args.start_minute * 60

    if args.mode == "dish":
        spec = SITES.get(
            args.site, dict(type="unknown", region="unknown", hw="unknown")
        )
        providers = [instrument(GrpcDish(), args.site, spec, endpoint, headers)]
    else:
        providers = [
            instrument(SimulatedDish(n, s, start), n, s, endpoint, headers)
            for n, s in SITES.items()
        ]

    print(
        f"exporting {len(providers)} site(s) to {endpoint} every {EXPORT_INTERVAL_S}s",
        flush=True,
    )
    try:
        time.sleep(args.minutes * 60)
    finally:
        for p in providers:
            p.shutdown()


if __name__ == "__main__":
    main()
