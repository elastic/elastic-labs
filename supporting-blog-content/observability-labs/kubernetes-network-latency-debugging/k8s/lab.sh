#!/usr/bin/env bash
# Runbook for the Kubernetes side of the lab. The notebook queries what this creates.
#
#   ./lab.sh up             kind cluster, images, EDOT Collector, CoreDNS query logs, 100 Mbit/s uplinks, workloads
#   ./lab.sh scenario       baseline, then the three incidents one at a time (about 80 minutes, unattended)
#   ./lab.sh degraded-on    incident 1: delay, jitter, and loss on worker3      (degraded-off to end it)
#   ./lab.sh noisy-on       incident 2: bulk-sync saturates worker3's uplink    (noisy-off to end it)
#   ./lab.sh dns-incident   incident 3: spread CoreDNS over worker2 and worker3 (dns-fix applies the fixed policy)
#   ./lab.sh reset          stale policy and CoreDNS back on worker2, to run the scenario again
#   ./lab.sh status         pod CIDRs, pod placement, traffic control, network policy
#   ./lab.sh down           delete the kind cluster
#
# Reads ../.env (copied from ../.env.example). Every incident command records its UTC time there
# as a LAB_* line, which the notebook reads. Keep the machine awake during the scenario
# (on macOS: caffeinate -i ./lab.sh scenario).
# Needs: docker, kind 0.24+, kubectl, helm.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=../.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${KUBE_STACK_VERSION:=0.16.0}"
: "${EDOT_VALUES_URL:=https://raw.githubusercontent.com/elastic/elastic-agent/refs/tags/v9.5.4/deploy/helm/edot-collector/kube-stack/managed_otlp/values.yaml}"
: "${BASELINE_MIN:=15}" "${DEGRADED_MIN:=10}" "${GAP_MIN:=10}" "${NOISY_MIN:=8}" "${DNS_MIN:=15}" "${AFTER_MIN:=12}"
CLUSTER=net-latency
WORKERS="$CLUSTER-worker $CLUSTER-worker2 $CLUSTER-worker3"
TBF="tbf rate 100mbit burst 512kb latency 100ms"

mark() {
  local ts; ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  touch "$ENV_FILE"
  { grep -v "^$1=" "$ENV_FILE" || true; echo "$1=$ts"; } > env.tmp
  cat env.tmp > "$ENV_FILE" && rm env.tmp   # cat keeps the permissions of .env
  echo "$ts $1"
}

uplink_cap() {   # the lab constraint: every worker uplink at 100 Mbit/s
  for node in $WORKERS; do
    docker exec "$node" tc qdisc replace dev eth0 root handle 1: $TBF
  done
}

stale_policy() { # render the old ipBlock rule with worker2's pod CIDR
  local cidr; cidr=$(kubectl get node "$CLUSTER-worker2" -o jsonpath='{.spec.podCIDR}')
  sed "s#__COREDNS_CIDR__#$cidr#" checkout-egress-stale.yaml | kubectl apply -f -
  echo "checkout-egress allows DNS only to $cidr (worker2)"
}

coredns_on_worker2() {
  kubectl -n kube-system patch deployment coredns --type=json \
    -p='[{"op":"remove","path":"/spec/template/spec/affinity/podAntiAffinity/requiredDuringSchedulingIgnoredDuringExecution"}]' 2>/dev/null || true
  kubectl -n kube-system patch deployment coredns --type=strategic --patch-file coredns-pin-patch.yaml
  kubectl -n kube-system rollout status deployment/coredns --timeout=180s
}

minutes() { echo "sleeping $1 min ($2)"; sleep $(( $1 * 60 )); }

case "${1:-}" in
  up)
    : "${ELASTIC_OTLP_ENDPOINT:?set it in .env}" "${ELASTIC_API_KEY:?set it in .env}"
    # The collector's gRPC exporter needs host:port; the Add data page shows the endpoint without it.
    ELASTIC_OTLP_ENDPOINT="${ELASTIC_OTLP_ENDPOINT%/}"
    case "${ELASTIC_OTLP_ENDPOINT#https://}" in *:*) ;; *) ELASTIC_OTLP_ENDPOINT="$ELASTIC_OTLP_ENDPOINT:443";; esac
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --config kind-config.yaml
    for node in $WORKERS; do
      docker exec "$node" tc qdisc show dev eth0 >/dev/null || { echo "tc is not available on $node"; exit 1; }
    done

    docker build -t checkout:lab apps/checkout
    docker build -t inventory:lab apps/inventory
    docker build -t lab-tools:lab apps/lab-tools
    kind load docker-image --name "$CLUSTER" --nodes "${WORKERS// /,}" checkout:lab inventory:lab lab-tools:lab

    # EDOT Collector and the OpenTelemetry Operator, as the Kubernetes quickstart installs them.
    helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null
    helm repo update >/dev/null
    kubectl create namespace opentelemetry-operator-system --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic elastic-secret-otel --namespace opentelemetry-operator-system \
      --from-literal=elastic_otlp_endpoint="$ELASTIC_OTLP_ENDPOINT" \
      --from-literal=elastic_api_key="$ELASTIC_API_KEY" \
      --dry-run=client -o yaml | kubectl apply -f -
    helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \
      --namespace opentelemetry-operator-system --version "$KUBE_STACK_VERSION" \
      --values "$EDOT_VALUES_URL" --wait --timeout 10m
    kubectl -n opentelemetry-operator-system get instrumentation elastic-instrumentation >/dev/null
    # On a laptop the cloud resource detectors wait for metadata endpoints that do not exist, so the
    # daemon collector needs about 30 s to start: more than the default startup probe allows.
    kubectl -n opentelemetry-operator-system patch otelcol opentelemetry-kube-stack-daemon --type=merge \
      -p '{"spec":{"startupProbe":{"periodSeconds":10,"failureThreshold":18}}}'
    kubectl -n opentelemetry-operator-system rollout status daemonset/opentelemetry-kube-stack-daemon-collector --timeout=300s

    # CoreDNS: both replicas on worker2, and the log plugin for one log line per query.
    coredns_on_worker2
    if ! kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}' | grep -qE '^ *log$'; then
      kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}' \
        | awk '{print} /^ *errors$/ && !done {print "    log"; done=1}' > Corefile.tmp
      kubectl -n kube-system create configmap coredns --from-file=Corefile=Corefile.tmp \
        --dry-run=client -o yaml | kubectl apply -f -
      rm -f Corefile.tmp
      kubectl -n kube-system rollout restart deployment/coredns
      kubectl -n kube-system rollout status deployment/coredns --timeout=180s
    fi

    uplink_cap
    kubectl apply -f workloads.yaml
    stale_policy
    kubectl -n shop rollout status deployment/inventory --timeout=300s
    kubectl -n shop rollout status deployment/checkout --timeout=300s
    kubectl -n shop rollout status deployment/loadgen --timeout=300s
    mark LAB_START
    echo "Lab is up. Run ./lab.sh scenario (about 80 minutes), or the incident commands one by one."
    ;;
  degraded-on)
    mark LAB_DEGRADED_START
    docker exec "$CLUSTER-worker3" sh -c "tc qdisc del dev eth0 root; tc qdisc add dev eth0 root handle 1: netem delay 60ms 20ms loss 3% && tc qdisc add dev eth0 parent 1:1 handle 10: $TBF"
    ;;
  degraded-off)
    # replace cannot turn the netem root into tbf, so delete it first
    docker exec "$CLUSTER-worker3" sh -c "tc qdisc del dev eth0 root 2>/dev/null; tc qdisc add dev eth0 root handle 1: $TBF"
    mark LAB_DEGRADED_END
    ;;
  noisy-on)
    kubectl apply -f noisy-receiver.yaml
    kubectl -n analytics rollout status deployment/iperf-receiver --timeout=120s
    kubectl -n analytics delete job bulk-sync --ignore-not-found --wait=true
    mark LAB_NOISY_START
    sed "s#__DURATION__#$(( NOISY_MIN * 60 + 120 ))#" bulk-sync-job.yaml | kubectl apply -f -
    ;;
  noisy-off)
    kubectl -n analytics delete job bulk-sync --ignore-not-found --wait=true
    mark LAB_NOISY_END
    ;;
  dns-incident)
    mark LAB_DNS_START
    kubectl -n kube-system patch deployment coredns --type=strategic --patch-file coredns-spread-patch.yaml
    kubectl -n kube-system rollout status deployment/coredns --timeout=180s
    kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide
    ;;
  dns-fix)
    kubectl apply -f checkout-egress-fixed.yaml
    mark LAB_DNS_FIX
    ;;
  scenario)
    minutes "$BASELINE_MIN" "baseline"
    "$0" degraded-on;  minutes "$DEGRADED_MIN" "incident 1, degraded node";   "$0" degraded-off
    minutes "$GAP_MIN" "recovery"
    "$0" noisy-on;     minutes "$NOISY_MIN" "incident 2, noisy neighbor";    "$0" noisy-off
    minutes "$GAP_MIN" "recovery"
    "$0" dns-incident; minutes "$DNS_MIN" "incident 3, CoreDNS spread";      "$0" dns-fix
    minutes "$AFTER_MIN" "after the fix"
    mark LAB_END
    echo "Scenario done. Run the notebook now."
    ;;
  reset)
    stale_policy
    coredns_on_worker2
    "$0" degraded-off >/dev/null; "$0" noisy-off >/dev/null
    { grep -v "^LAB_" "$ENV_FILE" || true; } > env.tmp && cat env.tmp > "$ENV_FILE" && rm env.tmp
    mark LAB_START
    ;;
  status)
    kubectl get nodes -o custom-columns=NODE:.metadata.name,POD_CIDR:.spec.podCIDR
    kubectl get pods -n shop -o wide
    kubectl get pods -n analytics -o wide 2>/dev/null || true
    kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide
    for node in $WORKERS; do echo "--- $node"; docker exec "$node" tc qdisc show dev eth0; done
    kubectl -n shop get networkpolicy checkout-egress -o yaml | sed -n '/egress:/,$p'
    grep "^LAB_" "$ENV_FILE" || true
    ;;
  down)
    kind delete cluster --name "$CLUSTER"
    ;;
  *)
    sed -n '2,14p' "$0"; exit 1
    ;;
esac
