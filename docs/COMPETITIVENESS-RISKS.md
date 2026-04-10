# COMPETITIVENESS RISKS

> This document does not claim current parity with large consumer platforms. It is a planning artifact.

**Align with:** `docs/TIKTOK-PARITY-RISKS.md`, `docs/LAUNCH-BLOCKERS.md`, `docs/LAUNCH-SCOPE-RECOMMENDATION.md`.

## Risk: launching wide but shallow

A wide-but-shallow launch creates the appearance of completeness without the operational depth to support it.
That is usually worse than shipping a smaller, tighter scope.

## Trust collapse

If the product claims more than it delivers, users lose confidence quickly.

Examples:

- feed promises “for you” depth it does not have
- moderation appears stronger than it really is
- AI/admin controls look real but do not persist

## Money incidents

Money problems damage trust fast.

Examples:

- payout or settlement race conditions
- stub/live ambiguity in payment flows
- seller or dispute workflows that support cannot resolve cleanly

## Support overload

Support load spikes when product ownership is ambiguous.

Examples:

- Ticket vs SupportTicket confusion
- order-linked incidents with no clear system of record
- weak payment lookup coverage for real incident resolution

## Moderation debt

Moderation debt grows fast under growth.

Examples:

- queue/escalation path exists only partially
- abuse controls are mostly placeholder
- operators cannot tell what is live vs stub

## Misleading UX from stubbed features

Stubbed features are especially harmful when they are visually polished.

Examples:

- seller onboarding looks “real” but is provider-dependent
- AI controls look editable but are read-only
- live filters/co-host appear shipped but are partial underneath

## Internationalization / locale embarrassment

Raw keys, broken copy, or inconsistent locale behavior make the product feel unfinished immediately.

## What to cut first if launch quality is slipping

Cut or defer:

1. broad feature claims
2. partially supported live tools
3. mobile parity promises
4. non-essential AI/admin surfaces
5. discovery depth claims beyond current backend capability

Keep:

- the narrowest reliable feed experience
- the cleanest supported auth flow
- the safest real money path
- the clearest support workflow
