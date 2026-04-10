> **Note:** This document does not claim current parity with TikTok. It is a planning artifact.

# TikTok parity — risks of claiming too much

Claiming **TikTok parity** or implying it before the product, trust stack, and ops can support it creates **predictable** failure modes. This is internal-facing.

---

## User trust risk

Users compare to TikTok **immediately**. Broken paging, missing thumbnails, or “infinite” scroll that ends awkwardly reads as **low quality** or **scam**, not “early startup.”

---

## Moderation / safety risk

If KYC, AI moderation, or reputation checks are **stub** or **off** but marketing implies **safety**, the platform attracts abuse and creates **harm** and **liability** exposure. Stub vs live must be **obvious** to operators and reflected in external copy.

---

## Payments / commerce risk

Ambiguous **stub vs live** money UX leads to **real financial loss** (wrong charges, failed payouts, fraud). Partial Redis locking and **no** universal payment lookup mean **ops** cannot assume TikTok-grade reconciliation without **explicit** tooling and process.

---

## Reliability / on-call risk

LIVE + queues + workers without a **minimum** triage story (`docs/RUNBOOK-ONCALL-MINIMUM.md`) mean incidents **linger** and creators/viewers churn. TikTok’s polish includes **SRE depth**; a narrow launch must still avoid **silent** failure modes.

---

## Legal / compliance risk

Music rights, age gating, regional rules, and DMCA-style workflows are **not** optional at scale. “We have a video app” without **owned** legal/process coverage for the **launch jurisdictions** is a **compliance** bet, not a code finish line.

---

## Product expectation risk

**Parity language** trains the market to expect **feature-complete** short video + LIVE + shop + DMs + sounds. Millo’s documented state includes **partial** discovery, **stub** live filters, **env-gated** providers—so **expectation mismatch** is the default failure mode if messaging is wrong.

---

## What to say instead

Use **bounded, verifiable** language:

- **“Millo is launching with:** [short list tied to Scope A/B/C in `docs/LAUNCH-SCOPE-RECOMMENDATION.md`].”
- **“Planned phases include:** [feed depth, live depth, commerce, etc.]—timeline depends on staffing and verification.”**
- **“We are not claiming feature parity with TikTok; we’re focused on [specific creator/viewer value] first.”**

Avoid:

- “TikTok killer,” “full TikTok experience,” “same algorithm,” “infinite For You” (unless backend **proves** it).
- Silent implication of **live** enforcement or **live** payments when providers are **stub** or **off**.

---

## Related docs

- `docs/LAUNCH-BLOCKERS.md`
- `docs/PRODUCTION-READINESS-PLAN.md`
- `docs/PLATFORM-GAPS.md`
- `docs/TIKTOK-PARITY-PHASES.md`
