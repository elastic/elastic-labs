"""Send 24 hours of sample Foundry agent traces to Elastic over OTLP.

The spans use the same names and attributes as the hosted agent in hosted_agent.py
(invoke_agent, Chat, execute_tool, plus the agent, tenant, conversation, session,
channel and caller attributes), so the dashboard queries work on them unchanged. The data
tells a small story: steady daily traffic across three channels, a burst of looping runs
from one caller that spikes gpt-4o token usage, a slow web_search tool, a mix of failures
(rate limits, content filter blocks, tool timeouts), and a tool the agent has never
called before showing up in the last few hours. It also sends a few runs from the
previous week, so the new tool stands out against the agent's history.

Install:
  pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http

Run:
  export OTEL_EXPORTER_OTLP_ENDPOINT="https://<your-motlp-endpoint>"
  export ELASTIC_API_KEY="<your-api-key>"
  python generate_sample_traces.py

The script covers the 24 whole hours that end at the top of the current hour, so the
dashboard's "Last 24 hours" setting shows it. Run it again later and it adds a new
window. Pass --service to change the service and agent name.
"""

import argparse
import math
import os
import random
import time
import uuid

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.id_generator import RandomIdGenerator
from opentelemetry.trace import SpanKind, Status, StatusCode

HOUR_NS = 3_600_000_000_000
MS = 1_000_000
SPIKE_HOUR = 15  # hour 0-23 of the window where the looping runs happen
NS = uuid.UUID(
    "6f1b7a52-3c1d-4d0e-9a58-0d7c5b8f2e11"
)  # makes the sample IDs repeatable
TENANT_ID = str(uuid.uuid5(NS, "tenant"))
AGENT_ID = str(uuid.uuid5(NS, "agent-instance"))
BLUEPRINT_ID = str(uuid.uuid5(NS, "agent-blueprint"))
CHANNELS = {"msteams": 0.55, "web": 0.30, "outlook": 0.15}
USERS = 120  # callers, with a few heavy ones
LOOP_USERS = [7, 12, 7, 12, 7]  # who triggered each of the LOOP_RUNS below
NEW_TOOL = "export_customer_data"  # first seen in the last hours of the window

# model -> (share of chat calls, response model name)
MODELS = {
    "gpt-4o": (0.45, "gpt-4o-2024-08-06"),
    "gpt-4o-mini": (0.40, "gpt-4o-mini-2024-07-18"),
    "gpt-4.1": (0.15, "gpt-4.1-2025-04-14"),
}
# tool -> (share of tool calls, median ms)
TOOLS = {
    "file_search": (0.49, 450),
    "mcp_ticket_lookup": (0.22, 1400),
    "web_search": (0.17, 2400),
    "code_interpreter": (0.12, 800),
}
# gen_ai.tool.type values that Agent 365 accepts
TOOL_TYPES = {
    "file_search": "file_search",
    "mcp_ticket_lookup": "MCP Server",
    "web_search": "function",
    "code_interpreter": "code_interpreter",
    NEW_TOOL: "function",
}

# The runs that loop on the same tool: (trace id, input tokens, output tokens, chat calls, hour)
LOOP_RUNS = [
    ("4f2a91c0" + "3b7d5e1a9c6f2d4817b39e" + "e7", 41200, 3180, 14, SPIKE_HOUR),
    ("a83d07b5" + "e29c41f6a07d83b5c1d29e" + "19", 28740, 2410, 11, SPIKE_HOUR),
    ("0c9e5d12" + "7a4b86f3d15e90c2b7a89e" + "a4", 19330, 1980, 9, SPIKE_HOUR),
    ("d17b62fa" + "05c8e34b9d2716af83e09e" + "3c", 12060, 1340, 6, SPIKE_HOUR),
    ("71e0a8c9" + "d3f5b2174a86c0e9d1f39e" + "5b", 9480, 920, 5, 9),
]
# (operation, error.type) -> number of failures to spread over the day
FAILURES = {
    ("chat", "rate_limit_exceeded"): 37,
    ("execute_tool", "TimeoutError"): 21,
    ("chat", "content_filter"): 12,
    ("execute_tool", "ConnectionError"): 6,
    ("invoke_agent", "MaxTokensExceeded"): 3,
}


class FixedIdGenerator(RandomIdGenerator):
    """Random span IDs, with an optional trace ID for the next root span."""

    next_trace_id = None

    def generate_trace_id(self):
        if self.next_trace_id is not None:
            tid, self.next_trace_id = self.next_trace_id, None
            return tid
        return super().generate_trace_id()


def lognormal(rng, median, sigma):
    return median * math.exp(rng.gauss(0, sigma))


def pick(rng, table):
    r, acc = rng.random(), 0.0
    for key, (share, _) in table.items():
        acc += share
        if r <= acc:
            return key
    return key


def plan_runs(rng):
    """Return a list of run dicts: hour, loop spec or None, and per-call plans."""
    # Diurnal traffic: quiet overnight, busy in the afternoon.
    weights = [1.0 + 0.3 * math.sin((h - 6) / 24 * 2 * math.pi) for h in range(24)]
    total_runs = 600
    runs = []
    for h, w in enumerate(weights):
        for _ in range(round(total_runs * w / sum(weights))):
            runs.append(
                {
                    "hour": h,
                    "loop": None,
                    "n_tools": rng.choices([0, 1, 2, 3], [0.2, 0.35, 0.3, 0.15])[0],
                }
            )
    for loop in LOOP_RUNS:
        runs.append({"hour": loop[4], "loop": loop, "n_tools": loop[3] - 1})
    rng.shuffle(runs)

    # Spread the failures over random normal runs that have room for them. Rate limits
    # cluster in the spike hours, where the looping runs hammer the deployment.
    failures = []
    for (op, err), n in FAILURES.items():
        failures += [(op, err)] * n
    rng.shuffle(failures)
    normal = [r for r in runs if r["loop"] is None]
    spike_runs = [r for r in normal if r["hour"] in (SPIKE_HOUR, SPIKE_HOUR + 1)]
    for op, err in failures:
        pool = (
            spike_runs
            if (err == "rate_limit_exceeded" and rng.random() < 0.55)
            else normal
        )
        while True:
            run = pool[rng.randrange(len(pool))]
            taken = [f for f in run.get("fail", []) if f[0] == op]
            room = {
                "chat": run["n_tools"] + 1,
                "execute_tool": run["n_tools"],
                "invoke_agent": 1,
            }[op]
            if len(taken) < room:
                run.setdefault("fail", []).append((op, err))
                break
    return runs


def baseline_runs():
    """One run a day for the week before the window, each using every regular tool."""
    return [
        {
            "hour": 10,
            "loop": None,
            "n_tools": len(TOOLS),
            "tools": list(TOOLS),
            "day_offset": d,
        }
        for d in range(2, 9)
    ]


def decorate_runs(runs, rng):
    """Give each run a caller, conversation, session and channel. Uses its own random
    stream so these extras never change the numbers in the main story."""
    weights = [
        1.0 / (i + 1) ** 0.8 for i in range(USERS)
    ]  # a few callers do most of the work
    channel_of = {}
    for run in runs:
        u = (
            LOOP_USERS[LOOP_RUNS.index(run["loop"])]
            if run["loop"]
            else rng.choices(range(USERS), weights)[0]
        )
        conv = f"conv-{u:03d}-{run['hour'] // 4}-{rng.randrange(2)}"
        if conv not in channel_of:
            channel_of[conv] = rng.choices(list(CHANNELS), list(CHANNELS.values()))[0]
        run.update(
            user_id=str(uuid.uuid5(NS, f"user-{u}")),
            conversation_id=str(uuid.uuid5(NS, conv)),
            session_id=str(uuid.uuid5(NS, f"session-{u}-{run['hour'] // 6}")),
            channel=channel_of[conv],
        )
    # The new tool shows up in two late runs that call file_search or code_interpreter.
    late = [
        r
        for r in runs
        if r["hour"] >= 21
        and r["n_tools"] >= 1
        and r["loop"] is None
        and not any(f[0] == "execute_tool" for f in r.get("fail", []))
    ]
    for r in late[:2]:
        r["new_tool"] = True


def emit_run(tracer, idgen, rng, run, window_start_ns, service_agent):
    loop = run["loop"]
    day_back = run.get("day_offset", 0) * 24 * HOUR_NS
    start = (
        window_start_ns
        - day_back
        + run["hour"] * HOUR_NS
        + rng.randrange(HOUR_NS - 60_000 * MS)
    )
    if loop:
        idgen.next_trace_id = int(loop[0], 16)
        n_chat = loop[3]
        model = "gpt-4o"
        # Split the run's token total across its model calls, front-loaded as context grows.
        parts = [rng.uniform(0.6, 1.4) for _ in range(n_chat)]
        in_tokens = [round(loop[1] * p / sum(parts)) for p in parts]
        out_tokens = [round(loop[2] * p / sum(parts)) for p in parts]
        in_tokens[-1] += loop[1] - sum(in_tokens)
        out_tokens[-1] += loop[2] - sum(out_tokens)
        tools = ["web_search"] * (n_chat - 1)
        models = [model] * n_chat
    else:
        n_tools = run["n_tools"]
        n_chat = n_tools + 1
        tools = run.get("tools") or [pick(rng, TOOLS) for _ in range(n_tools)]
        models = [pick(rng, MODELS) for _ in range(n_chat)]
        # Keep every normal run well under the loop runs' token totals.
        in_tokens = [min(int(lognormal(rng, 1500, 0.5)), 2300) for _ in range(n_chat)]
        out_tokens = [min(int(lognormal(rng, 200, 0.5)), 450) for _ in range(n_chat)]

    fails = list(run.get("fail", []))
    t = start
    ident = {
        "gen_ai.agent.id": AGENT_ID,
        "gen_ai.agent.name": service_agent,
        "microsoft.a365.agent.blueprint.id": BLUEPRINT_ID,
        "microsoft.tenant.id": TENANT_ID,
        "microsoft.session.id": run["session_id"],
        "gen_ai.conversation.id": run["conversation_id"],
        "microsoft.channel.name": run["channel"],
    }
    root = tracer.start_span(
        f"invoke_agent {service_agent}",
        kind=SpanKind.CLIENT,
        start_time=t,
        attributes={
            **ident,
            "gen_ai.operation.name": "invoke_agent",
            "user.id": run["user_id"],
        },
    )
    ctx = trace.set_span_in_context(root)
    root_error = None

    steps = []
    for i in range(n_chat):
        steps.append(("chat", models[i], i))
        if i < len(tools):
            steps.append(("execute_tool", tools[i], i))

    for kind, name, i in steps:
        failed = next((f for f in fails if f[0] == kind), None)
        if failed:
            fails.remove(failed)
        if kind == "chat":
            span = tracer.start_span(
                f"Chat {name}",
                context=ctx,
                kind=SpanKind.CLIENT,
                start_time=t,
                attributes={
                    **ident,
                    # The Microsoft distro writes this value with a capital C.
                    "gen_ai.operation.name": "Chat",
                    "gen_ai.provider.name": "microsoft.foundry",
                    "gen_ai.request.model": name,
                },
            )
            if failed:
                dur = int(lognormal(rng, 260, 0.4) * MS)
                span.set_attribute("error.type", failed[1])
                span.set_status(Status(StatusCode.ERROR))
            else:
                dur = int(lognormal(rng, 1180, 0.647) * MS)
                span.set_attribute("gen_ai.response.model", MODELS[name][1])
                span.set_attribute("gen_ai.usage.input_tokens", in_tokens[i])
                span.set_attribute("gen_ai.usage.output_tokens", out_tokens[i])
                span.set_status(Status(StatusCode.OK))
        else:
            if (
                failed
            ):  # timeouts hit the slow web_search tool, connection errors the ticket lookup
                name = (
                    "web_search" if failed[1] == "TimeoutError" else "mcp_ticket_lookup"
                )
            label = name
            if (
                run.get("new_tool")
                and name in ("file_search", "code_interpreter")
                and not failed
            ):
                label, run["new_tool"] = (
                    NEW_TOOL,
                    False,
                )  # the first eligible call gets the new tool
            span = tracer.start_span(
                f"execute_tool {label}",
                context=ctx,
                kind=SpanKind.INTERNAL,
                start_time=t,
                attributes={
                    **ident,
                    "gen_ai.operation.name": "execute_tool",
                    "gen_ai.tool.name": label,
                    "gen_ai.tool.type": TOOL_TYPES[label],
                    "gen_ai.tool.call.id": str(
                        uuid.uuid5(NS, f"call-{run['conversation_id']}-{start}-{i}")
                    ),
                },
            )
            if failed and failed[1] == "TimeoutError":
                dur = int(rng.uniform(9500, 10500) * MS)
                span.set_attribute("error.type", failed[1])
                span.set_status(Status(StatusCode.ERROR))
            elif failed:
                dur = int(lognormal(rng, 300, 0.5) * MS)
                span.set_attribute("error.type", failed[1])
                span.set_status(Status(StatusCode.ERROR))
            else:
                median = TOOLS[name][1]
                dur = int(lognormal(rng, median, 0.6) * MS)
        span.end(end_time=t + dur)
        t += dur + int(rng.uniform(5, 40) * MS)

    for op, err in fails:  # invoke_agent failures
        if op == "invoke_agent":
            root_error = err
    if root_error:
        root.set_attribute("error.type", root_error)
        root.set_status(Status(StatusCode.ERROR))
    root.end(end_time=t)
    return len(steps) + 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--service",
        default="support-agent-sample",
        help="service.name for the sample data",
    )
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    endpoint = os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"].rstrip("/")
    headers = {"Authorization": f"ApiKey {os.environ['ELASTIC_API_KEY']}"}

    idgen = FixedIdGenerator()
    provider = TracerProvider(
        resource=Resource.create({"service.name": args.service}), id_generator=idgen
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", headers=headers),
            max_queue_size=20000,
            max_export_batch_size=500,
        )
    )
    tracer = provider.get_tracer(args.service)

    rng = random.Random(args.seed)
    now = time.time_ns()
    window_start = now - now % HOUR_NS - 24 * HOUR_NS

    spans = 0
    runs = plan_runs(rng)
    decorate_runs(runs, random.Random(args.seed + 1))
    for run in runs:
        spans += emit_run(tracer, idgen, rng, run, window_start, args.service)
    history = baseline_runs()
    decorate_runs(history, random.Random(args.seed + 3))
    for run in history:
        spans += emit_run(
            tracer, idgen, random.Random(args.seed + 2), run, window_start, args.service
        )
    runs += history
    provider.shutdown()
    print(f"Sent {len(runs)} agent runs ({spans} spans) as service.name={args.service}")


if __name__ == "__main__":
    main()
