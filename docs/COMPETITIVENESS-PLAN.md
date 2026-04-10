# COMPETITIVENESS PLAN

> This document does not claim current parity with large consumer platforms. It is a planning artifact.

## Purpose

This document translates Millo’s current gap picture into a practical competitiveness plan.

For Millo, “competitive” does not mean matching every feature of the biggest platforms.
It means shipping a narrower product that feels reliable, honest, and supportable in the areas it promises.

Competitiveness is product depth + trust + money reliability + ops maturity + honest scope.

**Align with:** `docs/PLATFORM-GAPS.md`, `docs/PRODUCTION-READINESS-PLAN.md`, `docs/LAUNCH-SCOPE-RECOMMENDATION.md`.

## What “competitive” means for Millo

A competitive Millo launch should meet these conditions:

- the feed behaves consistently and does not overpromise personalization or infinite depth
- upload, processing, and playback are reliable enough to avoid obvious rough edges
- live features are scoped to what is actually supported
- money flows are clearly live or clearly unavailable, never ambiguous
- support can resolve order/payment incidents without model confusion
- operators can answer “what is broken?” quickly
- shipped locales and auth flows behave like real production surfaces, not dev leftovers

## Workstreams

### 1. Product experience

Focus:

- feed honesty and hydration
- creation/playback reliability
- live feature scope
- client polish
- social minimums only if in launch scope

### 2. Trust, safety & reputation

Focus:

- explicit live vs stub safety surfaces
- moderation path and escalation
- abuse/fraud controls that scale with money and traffic

### 3. Money, commerce & operations

Focus:

- real provider configuration
- locking/idempotency on critical paths
- seller/dispute/support depth
- incident lookup visibility without pretending universal search exists

### 4. Infrastructure & reliability

Focus:

- worker/queue/provider visibility
- basic SLO/incident discipline
- enough operational state to support launch

**Note:** Kafka and bundled ELK/Loki are not mandatory prerequisites for a narrow launch; expand tooling as risk and traffic justify.

### 5. Growth & communications

Focus:

- real email/push for promised flows
- honest launch positioning

### 6. Internal alignment

Focus:

- one support/order model story
- admin/AI controls that match reality
- auth/provider handling consistency

## Recommended order of execution

1. Money/auth/comms truthfulness and provider readiness
2. Support/order model alignment
3. Feed honesty, hydration fallbacks, and live scope cleanup
4. Trust/safety mode clarity and moderation path basics
5. Observability/on-call minimums
6. Post-launch product depth improvements

## What not to overclaim

Do not claim:

- TikTok-class personalization
- stable infinite feed if paging is still best-effort/offset
- live moderation depth that is not staffed/supported
- universal payment lookup if only reference-based coverage exists
- KYC or AI enforcement as “live” if providers are off
- mobile/web parity if some surfaces are still partial
