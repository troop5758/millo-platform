# Global security (Millo)

**Production:** https://milloapp.com

This page ties together **edge (Cloudflare)**, **application** controls, and the **final execution checklist** for a globally deployed platform.

---

## 11.1 WAF (Cloudflare)

| Control | Purpose |
|--------|---------|
| **Managed rules** | OWASP-class protections, common exploit signatures. |
| **Custom rules** | Block/challenge by path, country, ASN, header signals. |
| **Rate limiting (WAF)** | Throttle abusive IPs before origin. |

**Runbook:** `infra/cloudflare/global-security-part9.md` (Part 9 — WAF, DDoS, zero-trust summary).  
**CDN / TLS:** `infra/cloudflare/cdn-rules.md`.

---

## 11.2 Rate limiting per region

**Edge (per region / per POP effectively):**

- Cloudflare **WAF → Rate limiting rules** scoped to `api.milloapp.com` (and other hosts). Traffic is evaluated at the **nearest edge**, so limits naturally apply **per edge location** for a given client.
- For **different thresholds by country/region**, use **custom WAF rules** with a **geographic** condition (e.g. stricter limits for high-abuse regions) or **separate zones** / worker logic if you split hostnames by region.

**Origin (global app):**

- Fastify **`@fastify/rate-limit`** — global defaults and per-route limits (`packages/api/src/app.js`). For **multi-instance** consistency, use a **Redis** store (see `docs/rate-limiting.md`, `packages/api/src/lib/rateLimitRedisStore.js` when enabled).

**Alignment:** Edge limits should be **stricter or equal** to origin limits so the cluster is not the first line to absorb scrapers.

---

## 11.3 Bot detection

| Layer | Reference |
|-------|-----------|
| **Cloudflare** | Bot Fight Mode / Super Bot Fight Mode, WAF bot scores — `infra/cloudflare-bot-management.md` |
| **CAPTCHA** | Turnstile + app `captchaService` — same doc + env keys in deploy guides |
| **Edge Worker** | Lightweight text/body checks — `infra/cloudflare/edge-ai-low-latency.md`, `workers/edge-moderation.example.js` |
| **API / risk** | Fraud, device reputation, zero-trust fingerprint — `global-security-part9.md`, `packages/api/src/middleware/zeroTrustDeviceFingerprint.js` |

---

## Related index

| Topic | File |
|------|------|
| Bot management | `infra/cloudflare-bot-management.md` |
| Part 9 (WAF, DDoS, zero-trust) | `infra/cloudflare/global-security-part9.md` |
| Rate limiting (API) | `docs/rate-limiting.md` |
| Edge AI / moderation | `infra/cloudflare/edge-ai-low-latency.md` |
| Security checklist (legacy) | `docs/security-checklist.md` |

---

## Final execution checklist

Use after regional rollouts and before major traffic events.

### CORE

- [ ] **Kubernetes cluster live** — workloads healthy (`infra/k8s/`, `infra/global-load-balancing.md`).
- [ ] **API deployed** — `millo-api` Service + Ingress; `/health` green (`infra/k8s/api-deployment.yaml`, `ingress.yaml`).
- [ ] **Auto-scaling working** — HPA and/or KEDA behave under load (`infra/auto-scaling-strategy.md`).

### GLOBAL

- [ ] **Multi-region deployed** — clusters + DB replication + Kafka strategy (`infra/global-platform-stack.md`, `infra/global-database-strategy.md`, `infra/kafka-multi-cluster.md`).
- [ ] **Geo routing active** — `api.milloapp.com` steers to nearest healthy region (`infra/multi-region-geo-routing.md`).

### DELIVERY

- [ ] **CDN serving video** — origins, TLS, cache rules (`infra/cdn-video-delivery.md`, `infra/cloudflare/cdn-rules.md`).
- [ ] **HLS working globally** — playlists/segments reachable with acceptable TTLs; origin protected.

### EDGE

- [ ] **Edge moderation active** — Worker routes and policies where enabled (`infra/cloudflare/edge-ai-low-latency.md`).
- [ ] **Edge personalization working** — feed/geo routing Worker tested against real API paths.

### STREAMING

- [ ] **OBS ingest working** — stream keys, nginx-rtmp hooks (`infra/obs-rtmp-ingest-pro.md`, `infra/rtmp-obs.md`).
- [ ] **RTMP stable** — 1935 path, `on_publish` auth, monitoring under load.

### SCALE

- [ ] **Load tested** — k6/Locust scenarios documented (`infra/load-testing.md`).
- [ ] **Failover tested** — regional pool failure, DB primary failover, Kafka consumer recovery (runbooks + game days).

### SECURITY (this doc)

- [ ] **WAF** rules reviewed and logging enabled.
- [ ] **Rate limits** aligned edge + origin + Redis where multi-replica.
- [ ] **Bot detection** (CF + app) validated on critical paths.
