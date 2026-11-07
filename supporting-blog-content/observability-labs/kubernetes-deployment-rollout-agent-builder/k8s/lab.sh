#!/usr/bin/env bash
# Kubernetes side of the lab. The notebook calls these commands in order; you can also run them by hand.
#
#   ./lab.sh up            kind cluster, images, EDOT Collector + OpenTelemetry Operator, shop workloads on orders:1.4.0
#   ./lab.sh release       set orders to 1.5.0, pause the rollout once the second new pod is created
#   ./lab.sh rbac          ServiceAccount + Role + RoleBinding for the rollback workflow
#   ./lab.sh token         print a 4-hour token for that ServiceAccount (not written anywhere)
#   ./lab.sh tunnel-start  expose the kind API server through a cloudflared quick tunnel
#   ./lab.sh tunnel-stop   stop the tunnel
#   ./lab.sh status        ReplicaSets, pods and nodes of orders, rollout history
#   ./lab.sh down          stop the tunnel and delete the kind cluster
#
# Reads ../.env (copied from ../.env.example). up, release and tunnel-start record their UTC time
# (and the tunnel URL) there as LAB_* lines, which the notebook reads.
# Needs: docker, kind, kubectl, helm, cloudflared.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=../.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${KUBE_STACK_VERSION:=0.16.0}"
: "${EDOT_VALUES_URL:=https://raw.githubusercontent.com/elastic/elastic-agent/refs/tags/v9.5.5/deploy/helm/edot-collector/kube-stack/managed_otlp/values.yaml}"
CLUSTER=rollout-lab
WORKERS="$CLUSTER-worker $CLUSTER-worker2 $CLUSTER-worker3"

set_env() {   # replace or append KEY=VALUE in .env, keeping its permissions
  touch "$ENV_FILE"
  { grep -v "^$1=" "$ENV_FILE" || true; echo "$1=$2"; } > env.tmp
  cat env.tmp > "$ENV_FILE" && rm env.tmp
}

mark() {
  local ts; ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  set_env "$1" "$ts"
  echo "$ts $1"
}

new_rs_replicas() {   # desired replicas of the ReplicaSet that runs orders:1.5.0
  kubectl -n shop get rs -l app=orders \
    -o jsonpath='{range .items[?(@.spec.template.spec.containers[0].image=="orders:1.5.0")]}{.spec.replicas}{end}'
}

tunnel_stop() {
  if [ -f .tunnel.pid ]; then
    kill "$(cat .tunnel.pid)" 2>/dev/null || true
    rm -f .tunnel.pid
    echo "tunnel stopped"
  fi
}

case "${1:-}" in
  up)
    : "${OTLP_ENDPOINT:?set it in .env}" "${ELASTICSEARCH_API_KEY:?set it in .env}"
    OTLP_KEY="${ELASTIC_OTLP_API_KEY:-$ELASTICSEARCH_API_KEY}"
    # The collector's exporter needs host:port; the Add data page shows the endpoint without it.
    OTLP_ENDPOINT="${OTLP_ENDPOINT%/}"
    case "${OTLP_ENDPOINT#https://}" in *:*) ;; *) OTLP_ENDPOINT="$OTLP_ENDPOINT:443";; esac
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --config kind-config.yaml

    docker build -q -t orders:1.4.0 --build-arg VERSION=1.4.0 apps/orders >/dev/null
    docker build -q -t orders:1.5.0 --build-arg VERSION=1.5.0 apps/orders >/dev/null
    docker build -q -t pricing:lab apps/pricing >/dev/null
    docker build -q -t loadgen:lab apps/loadgen >/dev/null
    kind load docker-image --name "$CLUSTER" --nodes "${WORKERS// /,}" orders:1.4.0 orders:1.5.0 pricing:lab loadgen:lab >/dev/null
    echo "images orders:1.4.0 orders:1.5.0 pricing:lab loadgen:lab loaded on $WORKERS"

    # EDOT Collector and the OpenTelemetry Operator, as the Kubernetes quickstart installs them.
    helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null
    helm repo update >/dev/null
    kubectl create namespace opentelemetry-operator-system --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic elastic-secret-otel --namespace opentelemetry-operator-system \
      --from-literal=elastic_otlp_endpoint="$OTLP_ENDPOINT" \
      --from-literal=elastic_api_key="$OTLP_KEY" \
      --dry-run=client -o yaml | kubectl apply -f -
    helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \
      --namespace opentelemetry-operator-system --version "$KUBE_STACK_VERSION" \
      --values "$EDOT_VALUES_URL" --wait --timeout 10m >/dev/null
    echo "opentelemetry-kube-stack $KUBE_STACK_VERSION installed"
    kubectl -n opentelemetry-operator-system get instrumentation elastic-instrumentation >/dev/null
    # On a laptop the cloud resource detectors wait for metadata endpoints that do not exist, so the
    # daemon collector needs about 30 s to start: more than the default startup probe allows.
    kubectl -n opentelemetry-operator-system patch otelcol opentelemetry-kube-stack-daemon --type=merge \
      -p '{"spec":{"startupProbe":{"periodSeconds":10,"failureThreshold":18}}}'
    kubectl -n opentelemetry-operator-system rollout status daemonset/opentelemetry-kube-stack-daemon-collector --timeout=300s

    kubectl apply -f workloads.yaml
    for d in pricing orders; do kubectl -n shop rollout status "deployment/$d" --timeout=600s; done
    # Traffic starts once pricing and orders are ready, so no request fails while the lab boots.
    kubectl apply -f loadgen.yaml
    kubectl -n shop rollout status deployment/loadgen --timeout=300s
    mark LAB_START
    ;;
  release)
    mark LAB_RELEASE
    kubectl -n shop annotate deployment/orders kubernetes.io/change-cause="Release orders:1.5.0" --overwrite
    kubectl -n shop set image deployment/orders orders=orders:1.5.0
    # maxSurge 1: the first new pod, then minReadySeconds (120 s), then one old pod out and the second new pod in.
    for _ in $(seq 1 120); do
      [ "$(new_rs_replicas)" = "2" ] && break
      sleep 2
    done
    [ "$(new_rs_replicas)" = "2" ] || { echo "the new ReplicaSet never reached 2 replicas"; exit 1; }
    kubectl -n shop rollout pause deployment/orders
    mark LAB_PAUSED
    kubectl -n shop get rs -l app=orders -o wide
    ;;
  rbac)
    kubectl apply -f rbac.yaml
    ;;
  token)
    kubectl -n shop create token deployment-rollback --duration=4h
    ;;
  tunnel-start)
    tunnel_stop
    SERVER=$(kubectl config view --minify --context "kind-$CLUSTER" -o jsonpath='{.clusters[0].cluster.server}')
    # The API server certificate is self-signed for 127.0.0.1: cloudflared serves a valid certificate
    # on the public side and skips verification of the local origin.
    nohup cloudflared tunnel --no-autoupdate --url "$SERVER" --no-tls-verify > .tunnel.log 2>&1 &
    echo $! > .tunnel.pid
    URL=""
    for _ in $(seq 1 60); do
      URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' .tunnel.log | head -1 || true)
      [ -n "$URL" ] && break
      sleep 1
    done
    [ -n "$URL" ] || { echo "no tunnel URL, see k8s/.tunnel.log"; exit 1; }
    set_env LAB_TUNNEL_URL "$URL"
    echo "$URL"
    ;;
  tunnel-stop)
    tunnel_stop
    ;;
  status)
    kubectl -n shop get rs -l app=orders -o wide
    kubectl -n shop get pods -l app=orders -o wide
    kubectl -n shop rollout history deployment/orders
    grep "^LAB_" "$ENV_FILE" || true
    ;;
  down)
    tunnel_stop
    kind delete cluster --name "$CLUSTER"
    ;;
  *)
    sed -n '2,13p' "$0"; exit 1
    ;;
esac
