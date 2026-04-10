# Global database strategy

**Production:** https://milloapp.com

## Problem

| Issue | What goes wrong |
|-------|------------------|
| **Latency** | Users far from the primary region pay round-trip cost on every query; perceived slowness and higher TTFB for data-heavy features. |
| **Consistency** | Multiple writable regions without a clear model create **conflicts**, **split brain**, and **non-deterministic reads** unless you use CRDTs, careful sharding, or a single primary writer. |

## Solution (recommended pattern)

1. **Single primary** for writes — one region (or one Atlas “primary” shard) is authoritative for writes.
2. **Read replicas** (or secondary zones) **globally** — route **read-mostly** traffic to the nearest healthy replica with an explicit **consistency** story:
   - **Eventual consistency** for replicas (typical): reads may lag milliseconds–seconds behind the primary.
   - **Critical reads** (balances, entitlements, post-payment state) should **read from primary** or use **read-after-write** rules in application code.

3. **Application rules** — document which routes use `readPreference: primary` vs `secondaryPreferred` (MongoDB) or equivalent in Postgres connection pools.

---

## Stack options

### A) MongoDB Atlas — Global Cluster (fits Millo today)

Millo’s primary document store is **MongoDB** (`@millo/database`, Mongoose schemas). For multi-region:

- Use **MongoDB Atlas Global Clusters** (or a single multi-region replica set with **zone-aware** secondaries).
- **Writes** go to the **primary** region; **read replicas** in other regions serve local reads where safe.
- Configure **VPC peering / private endpoints** per region; connection strings per app region pointing at nearest nodes with correct read preference.

See also: `infra/provision-mongodb.sh` (single-node bootstrap); production Atlas is cloud-managed.

### B) PostgreSQL + read replicas

Suitable when you need **strong relational semantics** or an **ACID ledger** (Millo documents optional SQL ledger in `docs/data-storage-layer.md`, `packages/database/sql/ledger_optional.sql`).

- **One primary** (single region) for writes; **streaming replicas** in other regions for read scaling.
- Use **connection routing** (e.g. PgBouncer, RDS Proxy, or app-level primary vs replica DSNs).
- **Cross-region replication lag** still implies eventual consistency on replicas — same application discipline as MongoDB.

---

## Stack (summary)

```
                    ┌─────────────────┐
                    │  Primary (writes)│
                    │  one region      │
                    └────────┬────────┘
                             │ replication
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   Read replica          Read replica        Read replica
   (region A)            (region B)          (region C)
```

---

## Operational checklist

- [ ] **Backup / PITR** enabled on primary; restore runbook per provider.
- [ ] **Failover**: Atlas or RDS automatic failover documented; app retries and connection pool TTL compatible.
- [ ] **Secrets**: per-environment connection strings; no primary credentials on read-only workloads where avoidable.
- [ ] **Multi-region app**: pair with **`infra/multi-region-geo-routing.md`** so API instances in each region talk to the **nearest** DB endpoint that meets consistency needs.

---

## Related documentation

| Topic | Location |
|-------|----------|
| MongoDB schemas (authoritative) | `docs/phase-2-database-schemas.md` |
| Storage layer overview | `docs/data-storage-layer.md` |
| Global platform stack | `infra/global-platform-stack.md` |
| Event bus / Kafka (not a DB substitute) | `packages/api/src/services/kafkaEventBus.js`, `infra/k8s/kafka-*.yaml` |
