#!/bin/bash
# Data stream lifecycle for the shop streams: frozen after FROZEN_AFTER, deleted after RETENTION.
# usage (from the lab folder): set -a; . ./.env; set +a; FROZEN_AFTER=7d RETENTION=90d ./streams/lifecycle.sh
KB=$KIBANA_URL; API_KEY=$ELASTIC_API_KEY
for s in storefront orders billing stock-worker; do
  body=$(curl -s -H "Authorization: ApiKey $API_KEY" "$KB/api/streams/logs.otel.$s" | python3 -c "
import json, os, sys
ingest = json.load(sys.stdin)['stream']['ingest']
ingest.pop('updated_at', None); ingest['processing'].pop('updated_at', None)
ingest['lifecycle'] = {'dsl': {'data_retention': os.environ['RETENTION'], 'frozen_after': os.environ['FROZEN_AFTER']}}
print(json.dumps({'ingest': ingest}))")
  curl -s -X PUT -H "Authorization: ApiKey $API_KEY" -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
    "$KB/api/streams/logs.otel.$s/_ingest" -d "$body"; echo
done
