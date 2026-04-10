> **Note:** This document does not claim current parity with TikTok. It is a planning artifact.

# TikTok parity — phased execution

**Parity with TikTok-class completeness is not a single milestone.** These phases sequence **Millo-realistic** work: narrow launch → trust/reliability → depth → platform maturity. **Kafka and in-repo ELK/Loki are not prerequisites** for P0; expand observability as traffic and risk demand.

Align execution with `docs/PRODUCTION-READINESS-PLAN.md` and `docs/TIKTOK-PARITY-BACKLOG.md`.

---

## P0 — Narrow launch readiness

### Goals

- Ship a **defined** surface (prefer **Scope A** or minimal **Scope B** per `docs/LAUNCH-SCOPE-RECOMMENDATION.md`).
- Eliminate **misleading** stub/live ambiguity for whatever is **in** scope.
- Meet **launch blockers** where that scope touches money, auth, comms, support.

### Included workstreams (typical)

- Trust, safety & compliance (**declare** modes; surface to ops/admin).
- Client apps & UX polish (**honest** copy; no false infinite feed / hydration).
- Commerce & money (**only if in scope**—else explicitly excluded).
- Notifications (**real email** for any promised customer email).
- Org & process (**minimum** escalation, support model clarity).

### Exit criteria

- `docs/LAUNCH-BLOCKERS.md` cleared **or** scope reduced so blockers do not apply.
- `docs/PRODUCTION-CHECKLIST.md` launch-blocker section satisfied for chosen scope.
- Public positioning uses **narrow** language (`docs/TIKTOK-PARITY-RISKS.md`).

### Still deferred

- TikTok-class recommender, full LIVE depth, global shop, full ML ops platform, TikTok org scale.

---

## P1 — Reliability and trust expansion

### Goals

- Reduce incident duration and **support** pain; expand **live** enforcement only where staffed and configured.
- Harden money paths **beyond** narrowest coverage if commerce grows.

### Included workstreams (typical)

- Platform, data & ML ops (**deeper** worker/queue/provider visibility—not ELK as prerequisite).
- Live (**metadata** hardening; expand only contracted features).
- Trust, safety & compliance (**additional** live providers, moderation workflow depth as resourced).
- Commerce & money (locks/idempotency on more race-sensitive paths; seller verification depth).
- Social graph & messaging (**if** product commits—spam controls minimum).

### Exit criteria

- On-call can answer “what’s failing?” for queues, providers, and payments **for in-scope flows**.
- No major UX implies **persisted** admin/AI config unless API persists it.
- Support model for order-linked cases is **single story** (not split ambiguously).

### Still deferred

- Full TikTok FYP semantics, advanced LIVE commerce, global compliance program.

---

## P2 — Product depth expansion

### Goals

- Improve **discovery** quality and **creation** loop without claiming TikTok parity.
- Add LIVE and **limited** commerce depth **only** with matching backend and ops.

### Included workstreams (typical)

- Feed & discovery (hydration, subscription tier CRUD, filter pinning—per `docs/PLATFORM-GAPS.md`).
- Creation & editor polish (upload reliability, analytics meaningful to creators).
- Live (co-host/device analytics **if** scoped and built; filters beyond stub).
- Commerce & money (broader flows **without** pretending universal processor lookup).

### Exit criteria

- Discovery improvements are **documented** (paging/hydration honesty maintained).
- New surfaces have **acceptance criteria** and **owner**—no silent “TikTok-like” labels.

### Still deferred

- TikTok-scale ML, full sound rights, global shop parity.

---

## P3 — Platform maturity

### Goals

- Scale **data**, **experiments**, and **observability** as usage grows—still **without** mandating Kafka or bundled ELK as org dogma unless chosen deliberately.

### Included workstreams (typical)

- Platform, data & ML ops (pipelines, eval hooks, stronger SLO culture).
- Org & process (moderation scale, legal/partner cadence as needed).

### Exit criteria

- Phase goals defined **per metric** (reliability, abuse rate, creator retention)—not “we shipped Kafka.”

### Still deferred

- **Full** TikTok parity (multi-year, multi-function org—not a repo checkbox).

---

## Summary

| Phase | Intent |
|-------|--------|
| P0 | Safe, honest **narrow** launch |
| P1 | Reliability + trust + money depth as scope grows |
| P2 | Product depth (feed, live, commerce) **without** parity claims |
| P3 | Maturity and scale practices **as needed** |

Revisit phases when **launch scope** changes; do not inflate scope without re-running `docs/LAUNCH-SCOPE-RECOMMENDATION.md`.
