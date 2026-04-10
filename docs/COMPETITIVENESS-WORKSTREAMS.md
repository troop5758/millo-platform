# COMPETITIVENESS WORKSTREAMS

> This document does not claim current parity with large consumer platforms. It is a planning artifact.

Workstream states below reflect **likely** Millo reality per `docs/PLATFORM-GAPS.md` (partial, stub, env-gated)—verify before committing dates.

**Align with:** `docs/PRODUCTION-READINESS-PLAN.md`, `docs/LAUNCH-SCOPE-RECOMMENDATION.md`.

## Feed & discovery

**Current likely state:**

- partial discovery depth
- best-effort paging
- incomplete hydration on some rows

**Next improvement:**

- keep paging semantics honest
- improve row hydration/fallbacks
- complete missing CRUD and pinning gaps before deeper ranking claims

**Owner suggestion:** api, web, product

**Acceptance signal:** feed is consistent, honest, and not visibly broken on launch-critical paths

---

## Creation & playback

**Current likely state:**

- workable but still vulnerable to rough edges across upload/process/play flows

**Next improvement:**

- reduce obvious failure points and align analytics claims to actual tracking

**Owner suggestion:** api, web, mobile

**Acceptance signal:** launch-critical upload and playback paths are reliable enough to support creator trust

---

## Live

**Current likely state:**

- core live exists; filters/co-host/device analytics remain partial or scoped inconsistently; metadata routes exist (`PUT /streams/:id/metadata`, `PATCH /live/stream/:streamId`) but need hardening alignment

**Next improvement:**

- harden metadata/permissions
- hide or defer unsupported live capabilities
- align launch promise with real live depth

**Owner suggestion:** api, web, product

**Acceptance signal:** live feature list is clear and supportable

---

## Trust, safety & reputation

**Current likely state:**

- several safety surfaces are still env-gated, stubbed, or operator-opaque

**Next improvement:**

- make live/stub mode explicit
- define moderation path ownership and escalation
- strengthen anti-abuse basics where money/traffic justify it

**Owner suggestion:** api, web, ops, product

**Acceptance signal:** operators know what protections are truly active and how incidents escalate

---

## Money, commerce & operations

**Current likely state:**

- live/provider readiness and race coverage still need hardening in some paths; reference-based payment lookup exists but is not universal across all processor records

**Next improvement:**

- separate stub from live clearly
- extend locking/idempotency where incidents would matter
- ensure seller/dispute/support depth meets launch promise

**Owner suggestion:** api, web, ops, product

**Acceptance signal:** money flows are supportable, auditable, and not misleading

---

## Reliability & ops

**Current likely state:**

- thin but improving visibility; not a full observability product

**Next improvement:**

- strengthen provider/worker/queue visibility and runbooks

**Owner suggestion:** api, web, ops

**Acceptance signal:** on-call can answer basic “what is broken?” questions quickly

**Note:** do not require Kafka or in-repo ELK/Loki to clear this bar for a narrow launch.

---

## Growth & communications

**Current likely state:**

- some communications may still depend on provider readiness or partial wiring

**Next improvement:**

- use real email/push only where truly configured and promised

**Owner suggestion:** api, mobile, web, ops

**Acceptance signal:** customer communication channels behave like production systems

---

## Internal alignment

**Current likely state:**

- support model divergence, admin/AI read-only confusion, provider-handling inconsistency

**Next improvement:**

- one support/order story
- one admin/AI truth model
- one provider-not-configured behavior pattern

**Owner suggestion:** api, web, product

**Acceptance signal:** support, product, and engineering are using the same operational model
