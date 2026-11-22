# Log management at scale: companion lab

Generates logs for a small online shop (four services), ships them with the EDOT Collector to the `logs.otel` wired stream in Elastic, routes and parses them with Streams, moves older indices to the frozen tier, and queries them with ES|QL.

Tested on Elastic Cloud Hosted 9.5.6 with EDOT Collector 9.5.6, a hot tier and a frozen tier.

## Layout

| Path | What it does |
|---|---|
| `generator/shoplogs.py` | Writes four log files (nginx access log, three plain-text app logs). `--storm-at` adds a retry storm to `billing`. No dependencies. |
| `collector/otel.yml` | EDOT Collector: `file_log` receivers, `recombine` for multi-line errors, `transform` that targets `logs.otel`, `elasticsearch` exporter. |
| `collector/otel-no-recombine.yml` | Same config without `recombine`, so stack-trace lines land in the failure store (the "before" state in the article). |
| `docker-compose.yml` | Runs the generator and the collector, sharing a volume for the log files. `COLLECTOR_CONFIG` picks the collector config. |
| `streams/setup_streams.py` | Adds grok parsing and field mappings to the four child streams. |
| `streams/add_drop.py` | Adds a `drop_document` step for `stock-worker` health checks. |
| `lifecycle/logs-shop-frozen.json`, `lifecycle/apply-ilm.sh` | ILM policy (hot, frozen after 7 days, delete at 90 days) and a script that selects it for the four child streams. This is the path the article shows. |
| `streams/lifecycle.sh` | Alternative on 9.5: data stream lifecycle with a frozen phase (`frozen_after`) and retention. See the note below. |
| `queries/*.esql` | The ES|QL queries from the article. |
| `queries/service-owners.sh` | Creates the `service-owners` lookup index used by `LOOKUP JOIN`. |
| `storage/compare.sh` | Copies one stream into a standard index (default codec), a standard index with `best_compression` and a logsdb index, and compares their size on disk. |

## Run it

Run every command from this folder.

1. Copy `.env.example` to `.env` and fill in the Elasticsearch endpoint, the Kibana URL and an API key. The collector and every script read the same three variables. Load them into your shell:

   ```bash
   cp .env.example .env   # then edit .env
   set -a; . ./.env; set +a
   ```

2. Create the child streams under `logs.otel` (Kibana Streams API, or **Streams > logs.otel > Partitioning** in the UI), then add their parsing:

   ```bash
   for s in storefront orders billing stock-worker; do
     curl -s -X POST -H "Authorization: ApiKey $ELASTIC_API_KEY" -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
       "$KIBANA_URL/api/streams/logs.otel/_fork" \
       -d "{\"stream\":{\"name\":\"logs.otel.$s\"},\"where\":{\"field\":\"resource.attributes.service.name\",\"eq\":\"$s\"},\"status\":\"enabled\"}"
   done
   python3 streams/setup_streams.py
   ```

3. Start the shop and the collector (about 2,000 lines per second for 100 minutes, billing retry storm at minute 60). To see the failure store fill up as in the article, start with the collector config that does not join stack traces:

   ```bash
   COLLECTOR_CONFIG=otel-no-recombine.yml RATE=2000 MINUTES=100 STORM_AT=60 docker compose -p shoplab up -d
   ```

4. Before minute 45, run the pattern queries (`queries/top-patterns.esql`) and look at the **Data quality** tab of `logs.otel.orders` (`queries/failures.esql` lists the rejected lines). In the article, the top-patterns screenshot covers the first 45 minutes, before any drop rule.

5. At minute 45, add the drop rule and switch the collector to the config with the `recombine` operator. The collector resumes from its saved offsets:

   ```bash
   python3 streams/add_drop.py
   COLLECTOR_CONFIG=otel.yml docker compose -p shoplab up -d collector
   ```

6. After the run, create the lookup index (`queries/service-owners.sh`), compare storage (`storage/compare.sh`), set the lifecycle (`lifecycle/apply-ilm.sh`) and run the rest of `queries/`.

   To see indices on frozen without waiting a week, run `BACKDATE_DAYS=8 ./lifecycle/apply-ilm.sh`. It sets `index.lifecycle.origination_date` on the rolled-over indices, so ILM treats them as 8 days old. ILM checks every 10 minutes by default; `indices.lifecycle.poll_interval: 1m` speeds up a lab (set it back afterwards).

The generator is random and runs in real time, so your counts and sizes will differ from the article's. The shares stay close: health checks are about a quarter of all lines before the drop rule, and the storefront access log is about two thirds of the bytes.

Note on `streams/lifecycle.sh`: on the 9.5.6 deployment this lab was tested on, the data stream lifecycle frozen phase accepted the setting but did not convert any index to frozen, so the article uses ILM.

## Clean up

```bash
docker compose -p shoplab down -v
# then delete the four child streams in Streams (or DELETE /api/streams/logs.otel.<name>), the service-owners index,
# the cmp-* comparison indices and the logs-shop-frozen ILM policy
```
