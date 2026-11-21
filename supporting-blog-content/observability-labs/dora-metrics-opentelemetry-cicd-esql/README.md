# DORA metrics from telemetry you already collect

Companion files for [DORA metrics from telemetry you already collect: Where they mislead](https://www.elastic.co/observability-labs/blog/dora-metrics-opentelemetry-cicd-esql). Tested with Elastic Cloud Hosted 9.5.5, `dash0hq/otel-cicd-action` 4.2.0 and OpenTelemetry Collector Contrib 0.163.1.

## Run the lab

1. Copy `.env.example` to `.env`, then run sections 1 and 2 of the notebook. Note the `RULE_ID` it prints.
2. Create a **private** GitHub repository from `dora-metrics-lab/`. Add the variable `ELASTIC_OTLP_ENDPOINT` (managed OTLP endpoint, no trailing slash) and the secret `ELASTIC_API_KEY` (`create_doc` and `auto_configure` on `traces-*`, `metrics-*` and `logs-*`, and the `apm` privilege `event:write`).
3. Start the lab containers and a self-hosted runner labeled `dora-lab`:

   ```bash
   docker network create dora-lab
   docker run -d --name payments --network dora-lab nginx:1.29-alpine
   docker run -d --name loadgen --network dora-lab curlimages/curl:8.16.0 \
     sh -c 'while true; do curl -s -o /dev/null http://checkout:8080/checkout; sleep 0.5; done'
   TOKEN=$(gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token)
   docker run -d --name dora-runner --group-add 0 -v /var/run/docker.sock:/var/run/docker.sock \
     --entrypoint bash ghcr.io/actions/actions-runner:latest \
     -c "./config.sh --url https://github.com/<owner>/<repo> --token $TOKEN --name dora-lab --labels dora-lab --unattended && ./run.sh"
   ```

4. For pull request metrics, start the collector with a read-only GitHub token:

   ```bash
   export GITHUB_ORG=<owner> GITHUB_REPO=<owner>/<repo>
   docker run -d --name vcs-collector -e GITHUB_TOKEN -e GITHUB_ORG -e GITHUB_REPO -e ELASTIC_API_KEY -e ELASTIC_OTLP_ENDPOINT \
     -v "$PWD/collector/github-vcs.yaml:/etc/otelcol-contrib/config.yaml:ro" \
     otel/opentelemetry-collector-contrib:0.163.1
   ```

5. Push to `main` and run the scenario (about four hours; needs `gh`, `git` and `requests`):

   ```bash
   GITHUB_REPO=<owner>/<repo> LAB_REPO_DIR=<path to your clone> \
   KIBANA_URL=<kibana url> KIBANA_API_KEY=<api key> RULE_ID=<rule id> \
   python scenario.py
   ```

6. In `.env`, set `LAB_START` and `LAB_END` to the run's window (end about an hour after the last incident) and `OUTAGE_VERSIONS` to the `live_sha` of `payments_outage_start` in `scenario-events.jsonl`. Run the rest of the notebook.

## Clean up

The notebook's last section deletes what it created. Then remove the runner, the containers (`docker rm -f checkout payments loadgen dora-runner vcs-collector`), the network (`docker network rm dora-lab`) and the API keys.
