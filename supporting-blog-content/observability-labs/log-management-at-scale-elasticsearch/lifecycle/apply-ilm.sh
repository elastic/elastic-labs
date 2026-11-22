#!/bin/bash
# Create the logs-shop-frozen ILM policy and select it for the four shop streams
# (same as picking the policy in each stream's Data lifecycle tab).
# usage (from the lab folder): set -a; . ./.env; set +a; ./lifecycle/apply-ilm.sh
# Optional, lab only: BACKDATE_DAYS=8 sets index.lifecycle.origination_date on the
# rolled-over backing indices so the 7d frozen phase starts now instead of in a week.
set -e
ES_URL=$ELASTIC_ENDPOINT; KB=$KIBANA_URL; API_KEY=$ELASTIC_API_KEY
H="Authorization: ApiKey $API_KEY"; DIR=$(cd "$(dirname "$0")" && pwd)
curl -s -X PUT -H "$H" -H 'Content-Type: application/json' "$ES_URL/_ilm/policy/logs-shop-frozen" -d @"$DIR/logs-shop-frozen.json"; echo
for s in storefront orders billing stock-worker; do
  body=$(curl -s -H "$H" "$KB/api/streams/logs.otel.$s" | python3 -c "
import json, sys
ingest = json.load(sys.stdin)['stream']['ingest']
ingest.pop('updated_at', None); ingest['processing'].pop('updated_at', None)
ingest['lifecycle'] = {'ilm': {'policy': 'logs-shop-frozen'}}
print(json.dumps({'ingest': ingest}))")
  curl -s -X PUT -H "$H" -H 'kbn-xsrf: true' -H 'Content-Type: application/json' "$KB/api/streams/logs.otel.$s/_ingest" -d "$body"; echo
  if [ -n "$BACKDATE_DAYS" ]; then
    ORIG=$(python3 -c "import time; print(int((time.time()-$BACKDATE_DAYS*86400)*1000))")
    for idx in $(curl -s -H "$H" "$ES_URL/_data_stream/logs.otel.$s" | python3 -c "import json,sys; ix=json.load(sys.stdin)['data_streams'][0]['indices']; print(' '.join(i['index_name'] for i in ix[:-1]))"); do
      curl -s -X PUT -H "$H" -H 'Content-Type: application/json' "$ES_URL/$idx/_settings" -d "{\"index.lifecycle.origination_date\": $ORIG}"; echo " $idx"
    done
  fi
done
# Watch the move: GET .ds-logs.otel.*/_ilm/explain, then GET _cat/indices/partial-*?v&h=index,store.size,dataset.size
