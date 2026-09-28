# Lab

Requires Docker, kind, kubectl, Helm and k6 1.0+.

```
cp lab.env.example lab.env      # fill in the endpoint and key
./lab.sh up                     # kind cluster, worker capped at 2 CPUs, EDOT Collector, tenants
./lab.sh baseline
./lab.sh probe                  # own terminal, keep it running
# wait 5 minutes
./lab.sh contention             # wait 8 minutes, then run notebook sections 1 to 5
./lab.sh fix                    # wait 8 minutes, then run notebook sections 6 and 7
./lab.sh down
```

| File | Content |
|---|---|
| `kind-config.yaml` | Two-node cluster, host port 30080 to the storefront |
| `values-tenant-labels.yaml` | Helm values: cluster name and the `tenant` and `app` pod labels |
| `tenants.yaml` | `team-storefront` (NGINX, 10m CPU request) and `team-batch` (`stress`, 1 CPU request, 2 CPU limit) |
| `resourcequota.yaml` | `batch-budget` quota for `team-batch` |
| `probe.js` | k6 probe, one request at a time with a 200 ms pause |
