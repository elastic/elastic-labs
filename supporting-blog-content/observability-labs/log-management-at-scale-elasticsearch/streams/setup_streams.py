#!/usr/bin/env python3
"""Add parsing and field mappings to the four shop child streams (Kibana Streams API).

Usage (from the lab folder): set -a; . ./.env; set +a; python3 streams/setup_streams.py
The child streams are created first with POST /api/streams/logs.otel/_fork (see README).
"""
import json, os, urllib.request

KB, KEY = os.environ["KIBANA_URL"], os.environ["ELASTIC_API_KEY"]
APP = (
    "%{TIMESTAMP_ISO8601:attributes.log_time} %{LOGLEVEL:severity_text}\\s+"
    "\\[%{DATA:attributes.logger}\\] %{GREEDYDATA:attributes.event}"
)
NGINX = (
    "%{IP:attributes.client.address} - - \\[%{HTTPDATE:attributes.log_time}\\] "
    '"%{WORD:attributes.http.request.method} %{DATA:attributes.url.original} HTTP/%{NUMBER}" '
    "%{NUMBER:attributes.http.response.status_code:int} %{NUMBER:attributes.http.response.body.size:int} "
    '"%{DATA:attributes.http.request.referrer}" "%{DATA:attributes.user_agent.original}" '
    "rt=%{NUMBER:attributes.request_time_s:float} req_id=%{WORD:attributes.request_id}"
)
KW = {"type": "keyword"}
APP_FIELDS = {"attributes.logger": KW, "attributes.event": {"type": "match_only_text"}}
STREAMS = {
    "storefront": (
        [NGINX],
        {
            "attributes.client.address": {"type": "ip"},
            "attributes.http.request.method": KW,
            "attributes.http.response.status_code": {"type": "long"},
            "attributes.http.response.body.size": {"type": "long"},
            "attributes.request_time_s": {"type": "double"},
            "attributes.url.original": {"type": "keyword"},
            "attributes.user_agent.original": KW,
        },
    ),
    "orders": ([APP], APP_FIELDS),
    "billing": ([APP], APP_FIELDS),
    "stock-worker": ([APP], APP_FIELDS),
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


for name, (patterns, fields) in STREAMS.items():
    stream = f"logs.otel.{name}"
    ingest = call("GET", f"/api/streams/{stream}")["stream"]["ingest"]
    ingest["processing"] = {
        "steps": [{"action": "grok", "from": "body.text", "patterns": patterns}]
    }
    ingest["wired"]["fields"] = fields
    ingest.pop("updated_at", None)
    ingest["processing"].pop("updated_at", None)
    print(stream, call("PUT", f"/api/streams/{stream}/_ingest", {"ingest": ingest}))
