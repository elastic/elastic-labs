# Foundry agent traces in Kibana

Sample code for the Elastic Observability Labs post
"Microsoft Foundry agents, Agent 365, and Elastic: one set of traces, two jobs".
<!-- TODO: add blog URL once published -->

| File | What it is |
|---|---|
| `hosted_agent.py` | Foundry hosted agent container that emits `invoke_agent`, `chat` and `execute_tool` spans |
| `generate_sample_traces.py` | Sends 24 hours of sample agent traces to Elastic over OTLP |
| `foundry-agent-traces-dashboard.ndjson` | Kibana saved-objects export of the dashboard |
| `foundry-agent-dashboard.png` | Screenshot of the dashboard |

## Requirements

- Python 3.10 or later
- An Elastic deployment with a managed OTLP endpoint and an API key
- Tested on Elastic Cloud Serverless (no stack version to match)

## Try the dashboard with sample data

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit the values
set -a && source .env && set +a
python generate_sample_traces.py
```

In Kibana, go to **Stack Management > Saved Objects > Import** and import
`foundry-agent-traces-dashboard.ndjson`. Set the time range to **Last 24 hours**.

## Run the hosted agent

`hosted_agent.py` runs as a container in Microsoft Foundry. Foundry injects the `FOUNDRY_*`
variables. See the docstring at the top of the file for the install steps and the variables
you set yourself.
