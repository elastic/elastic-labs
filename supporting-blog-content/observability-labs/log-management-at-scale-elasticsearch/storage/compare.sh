#!/bin/bash
# Copy one stream into a standard index (default codec), a standard index with
# best_compression and a logsdb index, all with the same mappings,
# force merge both to one segment and print their size on disk.
# usage (from the lab folder): set -a; . ./.env; set +a; SRC=logs.otel.storefront ./storage/compare.sh
set -e
ES_URL=$ELASTIC_ENDPOINT; ES_API_KEY=$ELASTIC_API_KEY
H="Authorization: ApiKey $ES_API_KEY"; J='Content-Type: application/json'
SRC=${SRC:-logs.otel.storefront}
W=$(curl -s -H "$H" "$ES_URL/_data_stream/$SRC" | python3 -c "import json,sys;print(json.load(sys.stdin)['data_streams'][0]['indices'][-1]['index_name'])")
MAP=$(curl -s -H "$H" "$ES_URL/$W/_mapping" | python3 -c "import json,sys;print(json.dumps(list(json.load(sys.stdin).values())[0]['mappings']))")
for name in standard-default standard logsdb; do
  case $name in
    standard-default) SET='"index.mode":"standard"' ;;
    standard)         SET='"index.mode":"standard","index.codec":"best_compression"' ;;
    logsdb)           SET='"index.mode":"logsdb","index.sort.field":["resource.attributes.host.name","@timestamp"],"index.sort.order":["asc","desc"]' ;;
  esac
  curl -s -X DELETE -H "$H" "$ES_URL/cmp-$name" >/dev/null
  curl -s -X PUT -H "$H" -H "$J" "$ES_URL/cmp-$name" -d "{\"settings\":{$SET,\"number_of_shards\":1,\"number_of_replicas\":0},\"mappings\":$MAP}" >/dev/null
  curl -s -X POST -H "$H" -H "$J" "$ES_URL/_reindex?wait_for_completion=true&refresh=true" \
    -d "{\"source\":{\"index\":\"$SRC\",\"size\":5000},\"dest\":{\"index\":\"cmp-$name\",\"op_type\":\"create\"}}" | python3 -c "import json,sys;d=json.load(sys.stdin);print('$name reindexed',d.get('created'),d.get('failures')[:1])"
  curl -s -X POST -H "$H" "$ES_URL/cmp-$name/_forcemerge?max_num_segments=1" >/dev/null
done
sleep 45   # let merged segments settle before reading stats
for name in standard-default standard logsdb; do
  curl -s -H "$H" "$ES_URL/cmp-$name/_stats/docs,store" | python3 -c "
import json,sys; p=json.load(sys.stdin)['_all']['primaries']
print('cmp-$name', p['docs']['count'], 'docs', round(p['store']['size_in_bytes']/1048576,1), 'MiB')"
done
# Check the source mode: STORED means _source is kept as a second copy (no synthetic _source).
curl -s -H "$H" "$ES_URL/cmp-standard-default,cmp-standard,cmp-logsdb/_settings?filter_path=*.settings.index.mode,*.settings.index.mapping.source"
