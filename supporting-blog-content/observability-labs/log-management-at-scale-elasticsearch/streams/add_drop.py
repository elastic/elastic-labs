#!/usr/bin/env python3
"""Drop stock-worker health checks before they are indexed (Streams drop_document processor).

Usage (from the lab folder): set -a; . ./.env; set +a; python3 streams/add_drop.py
"""
import json, os, urllib.request

KB, KEY = os.environ["KIBANA_URL"], os.environ["ELASTIC_API_KEY"]
STREAM = "logs.otel.stock-worker"
DROP = {
    "action": "drop_document",
    "where": {"field": "attributes.event", "startsWith": "GET /healthz"},
}


def call(method, path, body=None):
    req = urllib.request.Request(
        f"{KB}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"ApiKey {KEY}",
            "kbn-xsrf": "true",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


ingest = call("GET", f"/api/streams/{STREAM}")["stream"]["ingest"]
ingest.pop("updated_at", None)
ingest["processing"].pop("updated_at", None)
ingest["processing"]["steps"].append(
    DROP
)  # runs after the grok step that fills attributes.event
print(call("PUT", f"/api/streams/{STREAM}/_ingest", {"ingest": ingest}))
