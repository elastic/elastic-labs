#!/usr/bin/env bash
# Runbook for the Kubernetes side of the lab. The notebook queries what this creates.
#
#   ./lab.sh up          create the kind cluster (soft eviction at 6Gi), install EDOT, deploy NGINX
#   ./lab.sh probe       run the k6 probe against NGINX (keep it running in its own terminal)
#   ./lab.sh stage1      start memory-change (256 MiB). Run after two hours of baseline
#   ./lab.sh stage2      start memory-escalation (1 GiB). Run about 4.5 minutes after stage1
#   ./lab.sh unload      delete both stress pods (to remove the load after an alert instead of waiting for the eviction)
#   ./lab.sh status      node conditions, pods on the worker with QoS and priority, evictions
#   ./lab.sh down        delete the kind cluster
#
# Needs: docker, kind, kubectl, helm, k6 (1.0+), and lab.env copied from lab.env.example.
set -euo pipefail
cd "$(dirname "$0")"
[ -f lab.env ] && . ./lab.env
: "${ELASTIC_OTLP_ENDPOINT:?set it in lab.env}" "${ELASTIC_API_KEY:?set it in lab.env}"
: "${KUBE_STACK_VERSION:=0.16.0}" "${TEST_ID:=node-pressure-v2}" "${PROBE_DURATION:=3h}"
CLUSTER=node-pressure-v2
WORKER=$CLUSTER-worker
# The collector's gRPC exporters need host:port; the Kibana Add data page shows the endpoint without it.
OTLP_ENDPOINT="${ELASTIC_OTLP_ENDPOINT%/}"
case "${OTLP_ENDPOINT#https://}" in *:*) ;; *) OTLP_ENDPOINT="$OTLP_ENDPOINT:443";; esac

case "${1:-}" in
  up)
    # Idempotent: rerunning `up` keeps the cluster and reapplies the secret, chart and workloads.
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --config kind-config.yaml
    # EDOT Collector through the kube-stack chart, exactly as the Kubernetes quickstart does.
    # Check the quickstart page for your stack version if the secret keys or flags changed.
    helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null
    helm repo update >/dev/null
    kubectl create namespace opentelemetry-operator-system --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic elastic-secret-otel --namespace opentelemetry-operator-system \
      --from-literal=elastic_otlp_endpoint="$OTLP_ENDPOINT" \
      --from-literal=elastic_api_key="$ELASTIC_API_KEY" \
      --dry-run=client -o yaml | kubectl apply -f -
    helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \
      --namespace opentelemetry-operator-system \
      --values "$EDOT_VALUES_URL" \
      -f values-node-pressure.yaml \
      --version "$KUBE_STACK_VERSION"
    # Collectors read the secret at start: restart them so a changed endpoint or key takes effect.
    kubectl -n opentelemetry-operator-system rollout restart deploy,daemonset -l app.kubernetes.io/managed-by=opentelemetry-operator 2>/dev/null || true
    kubectl apply -f workloads.yaml
    kubectl -n pressure-lab rollout status deploy/pressure-web --timeout=180s
    echo "pressure-web: http://localhost:30080/"
    echo "Now run ./lab.sh probe in another terminal and leave the cluster alone for two hours (the model baseline)."
    ;;
  probe)
    HOST="${OTLP_ENDPOINT#https://}"
    K6_OTEL_EXPORTER_PROTOCOL=http/protobuf \
    K6_OTEL_HTTP_EXPORTER_ENDPOINT="$HOST" \
    K6_OTEL_HTTP_EXPORTER_INSECURE=false \
    K6_OTEL_HTTP_EXPORTER_URL_PATH=/v1/metrics \
    K6_OTEL_HEADERS="Authorization=ApiKey $ELASTIC_API_KEY" \
    K6_OTEL_SERVICE_NAME=node-pressure-probe \
    K6_OTEL_METRIC_PREFIX=k6_ \
    K6_OTEL_EXPORT_INTERVAL=10s \
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=DELTA \
    TEST_ID="$TEST_ID" PROBE_DURATION="$PROBE_DURATION" \
      k6 run -o opentelemetry probe.js
    ;;
  stage1)
    date -u +"%Y-%m-%dT%H:%M:%SZ stage1: memory-change (256 MiB)"
    kubectl apply -f memory-change.yaml
    kubectl -n pressure-lab wait --for=condition=Ready pod/memory-change --timeout=120s
    ;;
  stage2)
    date -u +"%Y-%m-%dT%H:%M:%SZ stage2: memory-escalation (1 GiB)"
    kubectl apply -f memory-escalation.yaml
    kubectl -n pressure-lab wait --for=condition=Ready pod/memory-escalation --timeout=120s
    ;;
  unload)
    date -u +"%Y-%m-%dT%H:%M:%SZ unload"
    kubectl -n pressure-lab delete pod memory-change memory-escalation --ignore-not-found --wait=false
    ;;
  status)
    kubectl get node "$WORKER" -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'
    kubectl get pods -A --field-selector spec.nodeName="$WORKER" \
      -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,QOS:.status.qosClass,PRIORITY:.spec.priority,PHASE:.status.phase
    kubectl get events -A --field-selector reason=Evicted --sort-by=.lastTimestamp 2>/dev/null || true
    ;;
  down)
    kind delete cluster --name "$CLUSTER"
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1
    ;;
esac
