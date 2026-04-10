> **Note:** This document does not claim current parity with TikTok. It is a planning artifact.

# Launch scope recommendation

**Recommendation:** Default to the **narrowest** scope that matches **proven** repo + ops state, unless evidence (configured providers, staffed moderation, runbooks) explicitly supports more. Do **not** publicly promise TikTok parity.

Cross-check: `docs/LAUNCH-BLOCKERS.md`, `docs/PRODUCTION-CHECKLIST.md`, `docs/PLATFORM-GAPS.md`.

---

## Scope A — Short video core only

### Included

- Upload/publish and playback for **short video** within defined limits.
- Basic discovery **as implemented** (best-effort paging, honest empty/partial states).
- Account/auth flows **only** where providers are fully configured.
- Comments/follow (or other social) **only** if explicitly verified in scope—otherwise **out**.

### Must be true before launch

- Money paths either **out of scope** or **read-only** (no misleading checkout).
- Auth: no half-broken OAuth; provider-not-configured explicit.
- Trust/safety: **declared** mode (live vs stub); no false enforcement claims.
- Notifications: no customer reliance on console-only email for **promised** comms.
- UI/API honesty: no stable infinite feed or full hydration claims.

### Explicitly out of scope

- TikTok-class infinite FYP, full sound commercial catalog, advanced LIVE, shop-grade commerce, DM parity, TikTok-scale moderation.

### Biggest risk if launched too early

- **Product expectation risk:** users expect TikTok-like feed and polish; retention collapses and brand is damaged.

---

## Scope B — Short video + basic live

### Included

- Everything in **Scope A**, plus **basic** live viewing/broadcast **only** for routes and UX that are **hardened** and documented (metadata ownership, validation).
- Gifts/economy **only** if money blockers are cleared and modes are explicit.

### Must be true before launch

- All Scope A gates, plus:
- LIVE: metadata routes validated; filters/co-host/analytics either **cut from UX** or **honestly labeled** stub/partial.
- RTC/infra: acceptable quality and reconnect behavior for **stated** concurrency (not TikTok scale).
- On-call: minimum path for LIVE + payment failures (`docs/RUNBOOK-ONCALL-MINIMUM.md`).

### Explicitly out of scope

- Multi-guest/PK, TikTok Shop LIVE, global LIVE discovery ranking, TikTok-level transcoding/ladder unless built.

### Biggest risk if launched too early

- **Reliability/on-call risk:** LIVE + money together amplify incidents; **moderation** load spikes vs stub tooling.

---

## Scope C — Short video + basic live + limited commerce

### Included

- Scope B plus **bounded** commerce (e.g. specific seller flows, region, payment methods) with **explicit** stub/live separation.

### Must be true before launch

- All Scope B gates, plus:
- Production payment providers configured for **exactly** what is sold.
- Payout/settlement/reassignment paths reviewed for locks/idempotency where races matter.
- Seller verification and penalties/reassignment meet **written** SLA for this scope.
- Support: order-linked model unambiguous (`Ticket` vs `SupportTicket` resolved for ops).

### Explicitly out of scope

- TikTok Shop global catalog, universal payment lookup across every processor record, full tax/regulatory matrix.

### Biggest risk if launched too early

- **Payments/commerce risk:** double charges, stuck payouts, disputes—legal and trust impact.

---

## Final recommendation

Unless the team can **prove** (evidence, not intent) full provider config, trust posture, money hardening, and ops runbooks:

1. **Prefer Scope A** or a **minimal Scope B** (LIVE view-only or creator-only beta) over Scope C.
2. Expand scope only when **exit criteria** for the next phase in `docs/TIKTOK-PARITY-PHASES.md` are met.
3. Position publicly as **“Millo is launching with …”** not **“TikTok alternative with full parity.”**
