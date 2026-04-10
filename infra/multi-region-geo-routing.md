# Multi-region deployment — Geo routing for `api.milloapp.com`

Production domain: **https://milloapp.com**  
Full vertical stack (CDN → Geo DNS → K8s → …): **`infra/global-platform-stack.md`**  
API hostname: **https://api.milloapp.com**

## Target topology

```
User (global)
    → DNS (geo / latency aware)
    → Regional edge (optional: Cloudflare proxy)
    → Regional load balancer / Ingress (per cluster)
    → Kubernetes: millo-api (and workers)
```

## Regions (example)

| Region label   | Typical footprint | Example origin (per region)        |
|----------------|-------------------|------------------------------------|
| **US-East**    | North America East| `us-east-api.millo.internal` / ALB |
| **US-West**    | North America West| `us-west-api.millo.internal` / ALB |
| **Europe**     | EU                | `eu-api.millo.internal` / ALB      |
| **Asia**       | APAC              | `asia-api.millo.internal` / ALB    |

Origins are the **public hostname or IP** of each region’s API ingress (or a regional vanity name that resolves to that ingress).

## Routing strategy

1. **Primary:** Send each user to the **nearest healthy** region (latency / geography).
2. **Failover:** If that region’s pool is **unhealthy** (health check fails), traffic **steers to the next healthy** pool (ordered failover or dynamic steering, depending on product).

Health checks should hit **`GET https://<regional-api-host>/health`** (or path your ingress exposes; Millo API serves `/health`).

---

## Option A — Cloudflare (recommended if API is proxied through Cloudflare)

Use **Cloudflare Load Balancing** with **Geo Steering** (or **Dynamic Steering** for latency-based behavior).

### High-level steps

1. **SSL/TLS:** Full (strict) for `api.milloapp.com`.
2. **Load Balancer** (Traffic → Load Balancing):
   - Hostname: **`api.milloapp.com`** (or attach LB to the DNS record).
3. **Origin pools** (one per region), each listing that region’s API origin(s):
   - Pool `us-east` → US-East ingress hostname(s)
   - Pool `us-west` → US-West ingress hostname(s)
   - Pool `eu` → Europe ingress hostname(s)
   - Pool `asia` → Asia ingress hostname(s)
4. **Health checks:** HTTPS, path **`/health`**, interval as required (e.g. 15–60s), acceptable status **200**.
5. **Steering policy:**
   - **Geo Steering:** map continent/country groups to the closest pool (configure US East vs US West with subregions or split US into two geo rules).
   - Enable **fallback**: when a pool is down, Cloudflare sends traffic to another healthy pool (configure **fallback pool** / ordering per steering docs).
6. **DNS:** `api.milloapp.com` is **proxied** (orange cloud) and points at the load balancer hostname Cloudflare provides, or use a CNAME to the LB as documented in your CF plan.

### Notes

- **WebSockets:** Supported on Cloudflare; keep idle timeouts compatible with live chat (Millo uses long-lived WS).
- **Bypass cache** for API paths (see `infra/cloudflare/cdn-rules.md`); geo routing is independent of cache rules.

---

## Option B — AWS Route 53

Use **latency-based routing** for “nearest healthy” behavior, combined with **health checks** and **failover** records where you need explicit primary/secondary per geography.

### Pattern 1 — Latency records (simple)

1. Create a **Route 53 health check** per regional API endpoint (HTTPS, path `/health`).
2. For **`api.milloapp.com`**, create **A/AAAA alias** (or CNAME) records:
   - **Routing policy:** Latency
   - **Region:** `us-east-1`, `us-west-2`, `eu-west-1`, `ap-southeast-1` (match your real clusters)
   - **Alias target:** regional ALB / NLB for that cluster
   - **Associate** the region’s health check with each record

Route 53 returns the record with **lowest latency** among **healthy** targets.

### Pattern 2 — Failover within a geography

For stricter “if region A dies, use B” for the same user base, use **failover routing** (primary/secondary) per logical name, or nested aliases—design depends on whether you want global latency or per-continent stacks.

### DNS

- **Public hosted zone** for `milloapp.com`: record name **`api.milloapp.com`** → latency-based (or geo + failover) as above.

---

## DNS summary

| Hostname              | Purpose                         |
|-----------------------|---------------------------------|
| **`api.milloapp.com`**| Geo / latency routing to API    |

Regional **internal** names (e.g. `us-east-api...`) are optional; they help operations and can be **unproxied** records used only as Cloudflare origins or health-check targets.

---

## Operations checklist

- [ ] Each region runs API with the **same** external contract (or document version skew).
- [ ] **Global DB strategy** (primary writes, read replicas, consistency): **`infra/global-database-strategy.md`**
- [ ] **Kafka multi-cluster + MirrorMaker:** **`infra/kafka-multi-cluster.md`** (`infra/k8s/kafka-mirrormaker*.yaml`).
- [ ] **DB / S3** replication and consumer groups are designed for multi-region (see DB runbooks).
- [ ] **Sessions / state:** Prefer stateless API + shared Redis/DB; avoid pinning users to one region without sticky strategy.
- [ ] **Observability:** Per-region health dashboards; alert when a regional pool is unhealthy.

---

## Related repo files

- CDN / cache: `infra/cloudflare/cdn-rules.md`
- **L7 + Ingress layers:** `infra/global-load-balancing.md`
- API on Kubernetes: `infra/k8s/api-deployment.yaml`, `infra/k8s/ingress.yaml`
- Kafka cross-region: `infra/k8s/kafka-mirrormaker2-us-to-eu.yaml`, `kafka-mirrormaker2-eu-to-asia.yaml`
