> **Note:** This document does not claim current parity with TikTok. It is a planning artifact.

# TikTok parity — internal backlog

TikTok-level **completeness and polish** is a **multi-year program** (product, ML, ops, legal, moderation), not a single release. This backlog maps major capability areas to realistic Millo execution framing. See `docs/LAUNCH-SCOPE-RECOMMENDATION.md` and `docs/PLATFORM-GAPS.md` for current-state honesty.

---

## Feed & discovery

| | |
|--|--|
| **Why it matters** | Core retention; without stable feed semantics and hydration, the product feels broken next to TikTok. |
| **Current Millo state (honest)** | For You is **best-effort / offset / capped**; not stable infinite. Hydration is **incomplete** on some rows. Recommendation depth is **not** TikTok-class. |
| **Parity target** | Stable paging/cursors where product promises it; reliable row payloads; staged ranking/exploration—not overnight ML parity. |
| **Near-term next step** | Lock **launch-scoped** feed promises in UI/API; improve hydration for in-scope surfaces; document `pagingMode` / limits. |
| **Not in this phase** | Full multi-stage recommender, global sound graph, TikTok-scale experimentation platform. |

---

## Creation & editor polish

| | |
|--|--|
| **Why it matters** | Creation loop drives supply; weak capture/edit/upload loses creators vs TikTok. |
| **Current Millo state (honest)** | Varies by client; treat as **incremental** unless verified per surface. Upload/transcode/analytics depth typically lags TikTok. |
| **Parity target** | Reliable publish path, sensible editing, drafts, analytics that creators trust for **stated** launch scope. |
| **Near-term next step** | Audit create → publish → playback for **launch scope** only; fix top failure modes. |
| **Not in this phase** | Effect House–class AR, full licensed music catalog, TikTok-level template ecosystem. |

---

## Live

| | |
|--|--|
| **Why it matters** | LIVE is a major engagement and revenue surface for short-video platforms. |
| **Current Millo state (honest)** | Metadata routes **exist**; filters **stub**; co-host / device analytics **partial**. RTC scale is **not** proven at TikTok volume. |
| **Parity target** | For Millo: **honest** LIVE feature set per phase—stable core stream, moderation hooks, clear commerce boundary if in scope. |
| **Near-term next step** | Harden metadata ownership/validation; scope LIVE UI to what backend supports; document `PUT /streams/:id/metadata` vs `PATCH /live/stream/:streamId`. |
| **Not in this phase** | Full multi-guest/PK/Shop parity, edge SFU fleet, TikTok LIVE discovery ranking. |

---

## Trust, safety & compliance

| | |
|--|--|
| **Why it matters** | Public launch without clear live vs stub enforcement creates legal and user-trust exposure. |
| **Current Millo state (honest)** | KYC, AI moderation, Cloudflare reputation are **env-gated / partial / stub** when providers off; UI not always explicit. |
| **Parity target** | **Declared** launch mode per surface; operator visibility; no implied enforcement when stubbed. |
| **Near-term next step** | Decide launch posture; surface modes in admin/ops; align copy with `docs/PRODUCTION-READINESS-PLAN.md`. |
| **Not in this phase** | TikTok-scale human review queues, global policy org, full appeals machinery—unless explicitly staffed. |

---

## Social graph & messaging

| | |
|--|--|
| **Why it matters** | DMs, comments, graph power retention and reporting workflows. |
| **Current Millo state (honest)** | Treat as **variable**; not assumed TikTok-complete without inventory. |
| **Parity target** | Match **launch promise** only: e.g. follow + comments, or defer DMs. |
| **Near-term next step** | List which social features are **in** vs **out** for Scope A/B/C (`docs/LAUNCH-SCOPE-RECOMMENDATION.md`). |
| **Not in this phase** | Full spam-safe DM product, TikTok-level social graph ML. |

---

## Commerce & money

| | |
|--|--|
| **Why it matters** | Money bugs and ambiguous stub/live UX cause direct user harm and chargeback risk. |
| **Current Millo state (honest)** | Real processors **env-gated**; stubs exist; Redis lock **partial** beyond coin confirm; **no** universal payment lookup across all records; `PaymentReference` search is **partial** coverage. |
| **Parity target** | **Launch-scoped** commerce: configured live providers, explicit mode in API/UI, race-sensitive paths reviewed. |
| **Near-term next step** | Execute `docs/LAUNCH-BLOCKERS.md` and `docs/PRODUCTION-CHECKLIST.md` money sections. |
| **Not in this phase** | TikTok Shop–global catalog, tax/VAT matrix, full seller ops worldwide. |

---

## Notifications & growth

| | |
|--|--|
| **Why it matters** | Console email is not customer-grade; broken push erodes trust. |
| **Current Millo state (honest)** | Email/push **partial / env-gated**; delivery mode not always obvious to operators. |
| **Parity target** | Real provider for **promised** channels; honest scope for deferred channels. |
| **Near-term next step** | Configure production email; define push-in-scope vs out; ops checks in `docs/RUNBOOK-ONCALL-MINIMUM.md`. |
| **Not in this phase** | TikTok-scale growth engineering and campaign automation. |

---

## Client apps & UX polish

| | |
|--|--|
| **Why it matters** | TikTok polish is mostly **client + performance + i18n** at billions of sessions. |
| **Current Millo state (honest)** | Web vs mobile parity **uneven**; mobile LIVE filters / Milla / AI **stub or partial** by area; i18n needs **locale parity** for shipped strings. |
| **Parity target** | **One** primary client quality bar for launch; no false parity claims on deferred surfaces. |
| **Near-term next step** | Choose web-first vs mobile-in-launch; strip or label stub UX; DEV toggles not production RBAC. |
| **Not in this phase** | Pixel-perfect match to TikTok app across all locales and devices. |

---

## Platform, data & ML ops

| | |
|--|--|
| **Why it matters** | Ranking and safety at scale need data pipelines, eval, and observability—without pretending a single repo replaces an org. |
| **Current Millo state (honest)** | Worker/queue/health story is **thin** vs full ops product; Kafka is **not** required for a **narrow** launch story per project docs. |
| **Parity target** | **Minimum viable** on-call and triage (`docs/RUNBOOK-ONCALL-MINIMUM.md`); expand as traffic grows. |
| **Near-term next step** | Provider state, queue summaries, honest ops pages—**without** bundling ELK/Loki in-repo as a prerequisite. |
| **Not in this phase** | TikTok-scale feature stores and real-time ML platform unless explicitly funded. |

---

## Org & process

| | |
|--|--|
| **Why it matters** | Moderation, legal, partnerships, and 24/7 ops are **not** implementable as pure code. |
| **Current Millo state (honest)** | Repo docs do not replace staffed trust/safety, legal, or partner programs. |
| **Parity target** | **Minimum** process for launch jurisdiction: escalation path, content/policy owner, incident response. |
| **Near-term next step** | Assign owners for moderation posture, payment incidents, and support model (`Ticket` vs `SupportTicket` alignment per `docs/PLATFORM-GAPS.md`). |
| **Not in this phase** | TikTok-equivalent global headcount and policy infrastructure. |
