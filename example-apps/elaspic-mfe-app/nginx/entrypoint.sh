#!/bin/sh
set -eu
export API_UPSTREAM="${API_UPSTREAM:-api:3000}"
export UI_UPSTREAM="${UI_UPSTREAM:-ui:80}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://127.0.0.1:9/}"
export ELASTIC_OTEL_API_KEY="${ELASTIC_OTEL_API_KEY:-}"
envsubst '${API_UPSTREAM} ${UI_UPSTREAM} ${OTEL_EXPORTER_OTLP_ENDPOINT} ${ELASTIC_OTEL_API_KEY}' \
  < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
