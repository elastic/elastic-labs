#!/bin/bash
# Lookup index that maps each service to the team that pays for its logs.
# usage (from the lab folder): set -a; . ./.env; set +a; ./queries/service-owners.sh
ES_URL=$ELASTIC_ENDPOINT; ES_API_KEY=$ELASTIC_API_KEY
H="Authorization: ApiKey $ES_API_KEY"
curl -s -X PUT -H "$H" -H 'Content-Type: application/json' "$ES_URL/service-owners" -d '{
  "settings": { "index.mode": "lookup" },
  "mappings": { "properties": {
    "service.name": { "type": "keyword" },
    "team":         { "type": "keyword" },
    "cost_center":  { "type": "keyword" } } } }'
curl -s -X POST -H "$H" -H 'Content-Type: application/x-ndjson' "$ES_URL/service-owners/_bulk?refresh=true" --data-binary '
{"index":{}}
{"service.name":"storefront","team":"web","cost_center":"cc-110"}
{"index":{}}
{"service.name":"orders","team":"commerce","cost_center":"cc-220"}
{"index":{}}
{"service.name":"billing","team":"payments","cost_center":"cc-230"}
{"index":{}}
{"service.name":"stock-worker","team":"fulfilment","cost_center":"cc-310"}
'
