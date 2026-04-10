# IMPLEMENTATION ROLLING PLAN

## Phase 1 — Truth and visibility

- sync docs with current code reality
- keep provider/stub/env-gated states explicit
- keep AI controls read-only if persistence is not ready
- keep seller onboarding/provider dependency explicit
- keep discovery paging semantics honest

## Phase 2 — Harden what already exists

- standardize and test existing payment reference lookup coverage (`PaymentReference` upserts vs searchable surface)
- harden and validate existing stream metadata endpoints (`PUT /streams/:id/metadata`, `PATCH /live/stream/:streamId`)
- improve provider-state consistency in API responses where UI depends on it (bodies, not only headers/`/health`)
- clarify endpoint ownership and caveats in docs

## Phase 3 — Safety breadth

- roll Redis locking into more ledger/payout/settlement/reassignment-sensitive paths
- improve idempotency where money or settlement paths can race
- clarify support model divergence and usage (`Ticket` vs `SupportTicket`)

## Phase 4 — Observability lite

- improve worker/queue/provider summaries
- keep ops pages thin but truthful
- do not overclaim a full observability product

## Phase 5 — Deeper product completion

- AI controls persistence
- live KYC/provider completion
- discovery hydration and paging improvements (still not “fake infinite” until the model supports it)
- subscription tier CRUD completion
- broader live/co-host/device analytics depth

## Do not do yet

- do not add Kafka
- do not bundle ELK/Loki
- do not fake stable infinite discovery behavior
- do not claim payment reference lookup is universal across all money records
