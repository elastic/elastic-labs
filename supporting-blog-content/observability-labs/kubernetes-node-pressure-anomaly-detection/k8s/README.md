# Lab

Requires Docker with about 8 GiB of memory for the VM, kind, kubectl, Helm and k6 1.0+.

```
cp lab.env.example lab.env      # fill in the endpoint and key
./lab.sh up                     # kind cluster with a 6Gi soft eviction threshold, EDOT Collector, NGINX
./lab.sh probe                  # own terminal, keep it running
# run notebook sections 1 to 5 (job and rules), then wait two hours for the model baseline
./lab.sh stage1                 # 256 MiB
# wait about 4.5 minutes
./lab.sh stage2                 # 1 GiB
# run 1: wait until ./lab.sh status shows the evictions (about 5 minutes after MemoryPressure)
# run 2: ./lab.sh unload as soon as the headroom alert opens
# then run notebook sections 6 to 8
./lab.sh down
```

| File | Content |
|---|---|
| `kind-config.yaml` | Two-node cluster, worker kubelet with eviction-soft memory.available<6Gi and a 5m grace period, host port 30080 |
| `values-node-pressure.yaml` | Helm values: cluster name, MemoryPressure and DiskPressure conditions, 10 s sampling |
| `workloads.yaml` | Namespace `pressure-lab`, a negative PriorityClass, `pressure-web` (NGINX, no memory request, lowest priority on the node) and its NodePort Service |
| `memory-change.yaml` | Pod that allocates 256 MiB (stage 1) |
| `memory-escalation.yaml` | Pod that allocates 1 GiB (stage 2) |
| `probe.js` | k6 probe, about one request per second, exported through OpenTelemetry |
