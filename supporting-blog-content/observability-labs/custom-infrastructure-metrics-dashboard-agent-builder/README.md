# Building a custom infrastructure metrics dashboard with Elastic Agent Builder

Companion files for [the article](https://www.elastic.co/observability-labs/blog/custom-infrastructure-metrics-dashboard-agent-builder).

| File | What it is |
| --- | --- |
| `custom-infrastructure-metrics-dashboard-agent-builder.ipynb` | The whole lab, from the collector to clean up |
| `poller/starlink_poller.py` | Exports dish readings as OpenTelemetry gauges: `--mode simulate` (six sites, scripted incidents) or `--mode dish` (a real dish, through [starlink-grpc-tools](https://github.com/sparky8512/starlink-grpc-tools)) |
| `collector/config.yaml`, `docker-compose.yml` | EDOT Collector 9.5.6 |
| `prompts/` | The article's four prompts, plus `alternative-row-by-row-layout.md` for when you already know the field names |

## Run the notebook

```bash
cp .env.example .env    # fill in the values
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt jupyter
jupyter notebook custom-infrastructure-metrics-dashboard-agent-builder.ipynb
```

## Run the poller in real time

```bash
docker compose up -d
set -a; . ./.env; set +a
uv run poller/starlink_poller.py --mode simulate --minutes 120
```

Send the prompts in one chat 90 to 100 minutes in. To keep data flowing after the notebook, add `--start-minute 98`.

With a real dish, run one poller per site: `uv run --with starlink-grpc-core poller/starlink_poller.py --mode dish --site warehouse-reno`. `dish` mode wasn't run against hardware for the article.

## Simulated incidents

| Site | Minutes into the run | What happens |
| --- | --- | --- |
| `mine-pilbara` | 20 onward | Obstruction climbs to about 6%, with drop bursts while obstructed |
| `station-svalbard` | 30 to 70 | `is_heating` alert, power draw almost doubles |
| `farm-iowa` | 40 to 58 | Rain fade: ping drop rate up, downlink down |
| `clinic-atacama` | 60 to 85 | `thermal_throttle` alert, downlink cut to 40% |
| `vessel-north-sea` | whole run | Noisier latency, about 115 W |
| `warehouse-reno` | whole run | Healthy baseline |
