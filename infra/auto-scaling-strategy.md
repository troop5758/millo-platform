# Auto-scaling strategy

**Production:** https://milloapp.com  
Kubernetes **HPA** (built-in) + **KEDA** (event-driven) where metrics are not CPU/memory alone.

---

## Signals to scale on

| Signal | Typical use | Mechanism |
|--------|-------------|-----------|
| **CPU** | API, workers under compute pressure | `HorizontalPodAutoscaler` `Resource` metric (`cpu`) — see `infra/k8s/hpa-api.yaml`, `infra/k8s/api-deployment.yaml` (HPA section). |
| **Memory** | Heap-heavy services, FFmpeg buffers | HPA `Resource` metric (`memory`) — add alongside CPU in the same `HorizontalPodAutoscaler` `metrics` list. |
| **Active streams** | Ingest / Janus / stream edge | **Custom or external metric**: Prometheus (e.g. `sum(active_streams)`), or KEDA **Prometheus** / **Redis** scaler — must match a metric you actually export. |
| **Kafka lag** | Consumers falling behind | KEDA **`kafka`** trigger on `lagThreshold` — see `infra/k8s/keda-ffmpeg-workers-scaledobject.yaml` (`video.uploaded`, group `millo-ffmpeg-transcoder`). |

---

## Built-in: Horizontal Pod Autoscaler (CPU / memory)

Example **CPU-only** (as shipped for API):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: millo-api-hpa
  namespace: millo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: millo-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

**Add memory** (example — tune requests/limits first so utilization is meaningful):

```yaml
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
```

Requires **metrics-server** (or equivalent) in the cluster.

---

## Advanced: KEDA (event-driven scaling)

**KEDA** scales workloads from **Kafka lag**, **queue length**, **Prometheus** queries, **cron**, **CPU** (as a trigger among others), etc.

- **Install:** [KEDA](https://keda.sh/) Helm chart or YAML in each cluster.
- **CRDs:** `ScaledObject` / `ScaledJob` reference your **Deployment** (or other scale target) and one or more **triggers**.

### Kafka lag (in-repo example)

`infra/k8s/keda-ffmpeg-workers-scaledobject.yaml`:

- Target: Deployment **`ffmpeg-workers`**
- Trigger: **Kafka** — `bootstrapServers`, `consumerGroup`, `topic`, **`lagThreshold`**
- Tweak `minReplicaCount` / `maxReplicaCount` for your cost/SLA profile.

You can add **additional ScaledObjects** for other consumer groups (moderation, gifts, etc.) pointing at the right topic + group.

### Active streams (pattern)

1. **Expose a metric** (e.g. Prometheus `gauge`: concurrent RTMP/WebRTC publishers or `LiveStream` count with `status=live`).
2. KEDA **Prometheus** trigger:

```yaml
# Example only — replace server/query/threshold with your real metric.
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: janus-active-streams
  namespace: millo
spec:
  scaleTargetRef:
    name: janus
  minReplicaCount: 2
  maxReplicaCount: 30
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        query: sum(millo_active_streams)  # define in your metrics pipeline
        threshold: "5"
```

Until `millo_active_streams` exists, treat this as a **template**.

### Combining policies

- **Do not** attach both HPA and KEDA to the **same** Deployment without coordination — prefer **one** controller per target (often **KEDA-only** with multiple triggers, or **HPA-only** for simple CPU/memory).
- Use **behavior** (`scaleDown` / `scaleUp` stabilization windows) on HPA v2 or KEDA **advanced** settings to avoid flapping.

---

## Related manifests

| File | What it scales |
|------|----------------|
| `infra/k8s/hpa-api.yaml` | `millo-api` — CPU |
| `infra/k8s/api-deployment.yaml` | Bundled HPA (CPU 70%) — duplicate of intent; apply one HPA source |
| `infra/k8s/keda-ffmpeg-workers-scaledobject.yaml` | FFmpeg workers — **Kafka lag** |

---

## Related docs

- Global stack: `infra/global-platform-stack.md`
- Kafka topology: `infra/kafka-multi-cluster.md`
