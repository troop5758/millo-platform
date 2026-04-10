# COMPETITIVENESS LAUNCH GATES

> This document does not claim current parity with large consumer platforms. It is a planning artifact.

Launch a **narrow promise** first. Gate launch by what must be reliable and supportable, not by how many surfaces technically exist.

**Align with:** `docs/LAUNCH-SCOPE-RECOMMENDATION.md`, `docs/LAUNCH-BLOCKERS.md`, `docs/PRODUCTION-CHECKLIST.md`.

## Must-have before launch

- live payment/auth/email providers configured for the **launch promise**
- no misleading stub/live UX on money or safety surfaces
- one clear order-linked support path
- discovery/feed UX that is honest about current paging and hydration
- live scope trimmed to what is actually supported
- provider/worker/queue visibility sufficient for launch on-call
- shipped locales do not show raw keys on launch-critical screens

## Strongly recommended before launch

- broader locking/idempotency coverage on money-sensitive paths
- clearer moderation/escalation path ownership
- AI/admin terminology aligned with actual behavior
- mobile scope explicitly confirmed or explicitly deferred
- discovery/product claims reduced to actual backend capability

## Can follow after launch if not publicly promised

- deeper discovery sophistication (without claiming TikTok-class personalization until built)
- fuller feed hydration coverage
- broader live filters/co-host/device analytics depth
- wider mobile parity
- more advanced anti-abuse sophistication
- richer admin/AI configuration systems

## Gate rule

If a surface is:

- partial
- stubbed
- env-gated
- or support-ambiguous

then it should either:

- be completed,
- be visibly limited,
- or be removed from the launch promise.
