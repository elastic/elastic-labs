"""Create or update the "DORA metrics: checkout" dashboard with the Kibana Dashboards API (9.5).

usage: KIBANA_URL=... KIBANA_API_KEY=... [KIBANA_SPACE=...] python build_dashboard.py [from_iso] [to_iso]
KIBANA_API_KEY falls back to ELASTICSEARCH_API_KEY.
Every panel is an ES|QL visualization, so the queries match the article one to one.
"""

import json
import os
import sys
import uuid

import requests

SPACE = os.getenv("KIBANA_SPACE", "default")
KIBANA = os.environ["KIBANA_URL"].rstrip("/") + (
    "" if SPACE == "default" else f"/s/{SPACE}"
)
API_KEY = os.getenv("KIBANA_API_KEY") or os.environ["ELASTICSEARCH_API_KEY"]
HDR = {
    "Authorization": f"ApiKey {API_KEY}",
    "kbn-xsrf": "true",
    "Content-Type": "application/json",
    "elastic-api-version": "2023-10-31",
}
DASH_ID = "dora-metrics-checkout"
RULE = "checkout failed transaction rate by release"
FROM = sys.argv[1] if len(sys.argv) > 1 else "now-6h"
TO = sys.argv[2] if len(sys.argv) > 2 else "now"

DEPLOYS = """FROM traces-*.otel-*
| WHERE cicd.pipeline.task.type == "deploy" AND deployment.environment.name == "production"
    AND cicd.pipeline.task.run.result == "success\""""

LEAD = """FROM traces-*.otel-*
| WHERE service.name == "Deliver checkout" AND deployment.environment.name == "production"
| EVAL deploy_end = CASE(cicd.pipeline.task.type == "deploy" AND cicd.pipeline.task.run.result == "success",
    TO_DATETIME(TO_LONG(@timestamp) + duration / 1000000))
| STATS committed_at = MAX(TO_DATETIME(github.head_commit.timestamp)), deployed_at = MAX(deploy_end),
        attempt = MAX(github.run_attempt) BY trace.id
| WHERE deployed_at IS NOT NULL AND attempt == 1
| EVAL lead_minutes = DATE_DIFF("second", committed_at, deployed_at) / 60.0"""

CFR = f"""FROM traces-*.otel-*, .alerts-observability.threshold.alerts-default
| WHERE (cicd.pipeline.task.type == "deploy" AND deployment.environment.name == "production"
        AND cicd.pipeline.task.run.result == "success")
    OR kibana.alert.rule.name == "{RULE}"
| STATS deploys = COUNT(*) WHERE cicd.pipeline.task.type == "deploy",
        alerts = COUNT(*) WHERE kibana.alert.rule.name IS NOT NULL BY service.version
| WHERE deploys > 0"""

INCIDENTS = f"""FROM .alerts-observability.threshold.alerts-default
| WHERE kibana.alert.rule.name == "{RULE}"
| EVAL case.id = kibana.alert.case_ids
| STATS alert_start = MIN(kibana.alert.start), alert_end = MAX(kibana.alert.end) BY case.id, service.version
| LOOKUP JOIN .cases ON case.id"""

AXIS = {
    "x": {
        "title": {"visible": False},
        "ticks": {"visible": True},
        "grid": {"visible": True},
        "domain": {"type": "fit", "rounding": False},
        "labels": {"orientation": "horizontal"},
        "scale": "temporal",
    },
    "y": {
        "title": {"visible": False},
        "scale": "linear",
        "ticks": {"visible": True},
        "grid": {"visible": True},
        "domain": {"type": "full", "rounding": True},
        "labels": {"orientation": "horizontal"},
    },
}
STYLING = {
    "overlays": {
        "partial_buckets": {"visible": False},
        "current_time_marker": {"visible": False},
    },
    "fitting": {"type": "linear"},
    "interpolation": "linear",
    "points": {"visibility": "auto"},
    "areas": {"fill_opacity": 0.3},
}


def metric(title, query, grid):
    return {
        "type": "vis",
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, title)),
        "grid": grid,
        "config": {
            "description": title,
            "type": "metric",
            "sampling": 1,
            "ignore_global_filters": False,
            "data_source": {"type": "esql", "query": query},
            "metrics": [
                {"type": "primary", "column": title, "color": {"type": "auto"}}
            ],
            "styling": {
                "density": "compact",
                "primary": {
                    "position": "bottom",
                    "labels": {"alignment": "left"},
                    "value": {"sizing": "auto", "alignment": "right"},
                },
            },
        },
    }


def xy(
    title,
    description,
    query,
    grid,
    kind,
    x,
    ys,
    breakdown=None,
    temporal=True,
    legend=False,
):
    layer = {
        "type": kind,
        "data_source": {"type": "esql", "query": query},
        "sampling": 1,
        "ignore_global_filters": False,
        "x": {"column": x},
        "y": [{"column": y, "color": {"type": "auto"}} for y in ys],
    }
    if breakdown:
        layer["breakdown_by"] = {
            "column": breakdown,
            "color": {
                "mode": "categorical",
                "palette": "elastic_line_optimized",
                "mapping": [],
            },
        }
    axis = json.loads(json.dumps(AXIS))
    if not temporal:
        axis["x"]["scale"] = "ordinal"
    return {
        "type": "vis",
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, title)),
        "grid": grid,
        "config": {
            "title": title,
            "description": description,
            "type": "xy",
            "layers": [layer],
            "axis": axis,
            "styling": STYLING,
            "legend": {
                "placement": "outside",
                "position": "bottom",
                "layout": {"type": "list"},
                "visibility": "visible" if (breakdown or legend) else "hidden",
            },
        },
    }


panels = [
    metric(
        "Deployments to production",
        DEPLOYS + "\n| STATS `Deployments to production` = COUNT(*)",
        {"x": 0, "y": 0, "w": 12, "h": 5},
    ),
    metric(
        "Median lead time, merge to production (min)",
        LEAD
        + "\n| STATS `Median lead time, merge to production (min)` = ROUND(MEDIAN(lead_minutes), 1)",
        {"x": 12, "y": 0, "w": 12, "h": 5},
    ),
    metric(
        "Change failure rate (%)",
        CFR + "\n| STATS d = COUNT(*), f = COUNT(*) WHERE alerts > 0"
        "\n| EVAL `Change failure rate (%)` = ROUND(100.0 * f / d, 1) | KEEP `Change failure rate (%)`",
        {"x": 24, "y": 0, "w": 12, "h": 5},
    ),
    metric(
        "Median time to restore (min)",
        f'FROM .alerts-observability.threshold.alerts-default\n| WHERE kibana.alert.rule.name == "{RULE}" '
        'AND kibana.alert.status == "recovered"\n'
        "| STATS `Median time to restore (min)` = ROUND(MEDIAN(kibana.alert.duration.us) / 60000000.0, 1)",
        {"x": 36, "y": 0, "w": 12, "h": 5},
    ),
    xy(
        "Deploy jobs by result",
        "cicd.pipeline.task.type: deploy. Pull request builds report the deploy job as skip.",
        'FROM traces-*.otel-*\n| WHERE cicd.pipeline.task.type == "deploy"'
        "\n| STATS `Deploy jobs` = COUNT(*) BY `Time` = BUCKET(@timestamp, 24, ?_tstart, ?_tend), `Result` = cicd.pipeline.task.run.result"
        "\n| SORT `Time`",
        {"x": 0, "y": 5, "w": 24, "h": 10},
        "bar_stacked",
        "Time",
        ["Deploy jobs"],
        breakdown="Result",
    ),
    xy(
        "Lead time per deployment, merge to production (min)",
        "github.head_commit.timestamp on a push to main is the merge time, so this excludes review time.",
        LEAD
        + "\n| KEEP deployed_at, lead_minutes | RENAME deployed_at AS `Deployed at`, lead_minutes AS `Lead time (min)`"
        "\n| SORT `Deployed at`",
        {"x": 24, "y": 5, "w": 24, "h": 10},
        "bar_stacked",
        "Deployed at",
        ["Lead time (min)"],
    ),
    xy(
        "Incidents: alert active vs case open (min)",
        "One row per release that triggered the rule. Case time includes the wait before someone closes it.",
        INCIDENTS + "\n| EVAL `Release` = SUBSTRING(service.version, 1, 7),"
        '\n    `Alert active (min)` = ROUND(DATE_DIFF("second", alert_start, alert_end) / 60.0, 1),'
        "\n    `Case open (min)` = ROUND(case.time_to_resolve / 60.0, 1)"
        "\n| KEEP `Release`, `Alert active (min)`, `Case open (min)`",
        {"x": 0, "y": 15, "w": 24, "h": 10},
        "bar_horizontal",
        "Release",
        ["Alert active (min)", "Case open (min)"],
        temporal=False,
        legend=True,
    ),
    xy(
        "Pull request time to merge (min)",
        "vcs.change.time_to_merge from the githubreceiver (Development metric).",
        "FROM metrics-githubreceiver.otel-*\n| WHERE vcs.change.time_to_merge IS NOT NULL"
        "\n| STATS `Time to merge (min)` = MAX(vcs.change.time_to_merge) / 60.0 BY `Branch` = vcs.ref.head.name"
        "\n| SORT `Branch`",
        {"x": 24, "y": 15, "w": 24, "h": 10},
        "bar_horizontal",
        "Branch",
        ["Time to merge (min)"],
        temporal=False,
    ),
]

body = {
    "data": {
        "title": "DORA metrics: checkout",
        "description": "Deployment frequency, lead time, change failure rate and time to restore assembled with ES|QL "
        "from OpenTelemetry CI/CD traces, service.version deployment markers, alerts and cases.",
        "options": {
            "auto_apply_filters": True,
            "hide_panel_borders": False,
            "hide_panel_titles": False,
            "sync_colors": False,
            "sync_cursor": True,
            "sync_tooltips": False,
            "use_margins": True,
        },
        "tags": [],
        "time_range": {"from": FROM, "to": TO},
        "filters": [],
        "query": {"expression": "", "language": "kql"},
        "pinned_panels": [],
        "panels": panels,
    }
}

data = body["data"]
# PUT creates the dashboard with a fixed id, or replaces it if it already exists.
r = requests.put(
    f"{KIBANA}/api/dashboards/{DASH_ID}", headers=HDR, json=data, timeout=60
)
print(r.status_code, r.text[:600])
r.raise_for_status()
