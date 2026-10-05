#!/usr/bin/env bash
# Runbook for the Kubernetes side of the lab. The notebook queries what this creates.
#
#   ./lab.sh up          create the kind cluster, cap the worker at 2 CPUs, install EDOT, deploy the tenants
#   ./lab.sh probe       run the k6 probe against the storefront (keep it running in its own terminal)
#   ./lab.sh baseline    no noisy neighbor: batch-export at 0 replicas, no quota
#   ./lab.sh contention  reset to the noisy state and start batch-export (1 replica) on the worker
#   ./lab.sh fix         apply the new requests and limits, then the ResourceQuota
#   ./lab.sh status      node conditions, pods and their resources
#   ./lab.sh down        delete the kind cluster
#
# Needs: docker, kind, kubectl, helm, k6 (1.0+, tested with 2.3), and lab.env copied from lab.env.example.
set -euo pipefail
cd "$(dirname "$0")"
[ -f lab.env ] && . ./lab.env
: "${ELASTIC_OTLP_ENDPOINT:?set it in lab.env}" "${ELASTIC_API_KEY:?set it in lab.env}"
: "${KUBE_STACK_VERSION:=0.16.0}" "${TEST_ID:=noisy-neighbor-final}" "${PROBE_DURATION:=30m}"
CLUSTER=noisy-neighbor
WORKER=$CLUSTER-worker
# The collector's gRPC exporters need host:port; the Kibana Add data page shows the endpoint without it.
OTLP_ENDPOINT="${ELASTIC_OTLP_ENDPOINT%/}"
case "${OTLP_ENDPOINT#https://}" in *:*) ;; *) OTLP_ENDPOINT="$OTLP_ENDPOINT:443";; esac

case "${1:-}" in
  up)
    # Idempotent: rerunning `up` keeps the cluster and reapplies the secret, chart and tenants.
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --config kind-config.yaml
    # CFS quota on the worker's container. The kubelet keeps reporting the host CPUs as capacity.
    docker update --cpus=2 "$WORKER"
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
      -f values-tenant-labels.yaml \
      --version "$KUBE_STACK_VERSION"
    # Collectors read the secret at start: restart them so a changed endpoint or key takes effect.
    kubectl -n opentelemetry-operator-system rollout restart deploy,daemonset -l app.kubernetes.io/managed-by=opentelemetry-operator 2>/dev/null || true
    kubectl apply -f tenants.yaml
    kubectl -n team-storefront rollout status deploy/storefront --timeout=180s
    echo "storefront: http://localhost:30080/export.bin"
    ;;
  probe)
    HOST="${OTLP_ENDPOINT#https://}"
    K6_OTEL_EXPORTER_PROTOCOL=http/protobuf \
    K6_OTEL_HTTP_EXPORTER_ENDPOINT="$HOST" \
    K6_OTEL_HTTP_EXPORTER_INSECURE=false \
    K6_OTEL_HTTP_EXPORTER_URL_PATH=/v1/metrics \
    K6_OTEL_HEADERS="Authorization=ApiKey $ELASTIC_API_KEY" \
    K6_OTEL_SERVICE_NAME=noisy-neighbor-probe \
    K6_OTEL_METRIC_PREFIX=k6_ \
    K6_OTEL_EXPORT_INTERVAL=10s \
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=DELTA \
    TEST_ID="$TEST_ID" PROBE_DURATION="$PROBE_DURATION" \
      k6 run -o opentelemetry probe.js
    ;;
  baseline)
    # No noisy neighbor: batch-export at 0 replicas, no quota, original resources.
    kubectl -n team-batch delete resourcequota batch-budget --ignore-not-found
    kubectl apply -f tenants.yaml >/dev/null
    kubectl -n team-batch scale deploy/batch-export --replicas=0
    kubectl -n team-storefront rollout status deploy/storefront --timeout=120s
    ;;
  contention)
    # Always start from the noisy state: no quota, original requests and limits from tenants.yaml.
    kubectl -n team-batch delete resourcequota batch-budget --ignore-not-found
    kubectl apply -f tenants.yaml >/dev/null
    kubectl -n team-storefront rollout status deploy/storefront --timeout=120s
    kubectl -n team-batch scale deploy/batch-export --replicas=1
    kubectl -n team-batch rollout status deploy/batch-export --timeout=120s
    ;;
  fix)
    kubectl set resources deployment/batch-export -n team-batch \
      --requests=cpu=500m,memory=512Mi \
      --limits=cpu=500m,memory=768Mi
    kubectl set resources deployment/storefront -n team-storefront \
      --requests=cpu=500m,memory=32Mi \
      --limits=memory=128Mi
    kubectl -n team-batch rollout status deploy/batch-export --timeout=120s
    kubectl -n team-storefront rollout status deploy/storefront --timeout=120s
    # Quota only after the rollouts: the old batch pod (2 CPU limit) counts against a 1 CPU budget
    # and would block the rolling update's new pod at admission.
    kubectl apply -f resourcequota.yaml
    ;;
  status)
    kubectl get node "$WORKER" -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'
    kubectl get pods -A -o wide --field-selector spec.nodeName="$WORKER"
    kubectl -n team-batch describe quota batch-budget 2>/dev/null || true
    ;;
  down)
    kind delete cluster --name "$CLUSTER"
    ;;
  *)
    sed -n '2,13p' "$0"; exit 1
    ;;
esac
