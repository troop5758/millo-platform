# COMPETITIVENESS CHECKLIST

> This document does not claim current parity with large consumer platforms. It is a planning artifact.

**Align with:** `docs/PLATFORM-GAPS.md`, `docs/PRODUCTION-CHECKLIST.md`, `docs/LAUNCH-SCOPE-RECOMMENDATION.md`.

## Product experience

### Feed & discovery

- [ ] paging semantics are explicit and consistent
- [ ] UI does not imply stable infinite feed if unsupported
- [ ] feed cards have reliable title/thumb/media fallbacks
- [ ] ranking claims match actual backend capability

### Creation & playback

- [ ] upload -> processing -> playback succeeds reliably for launch formats
- [ ] creator-facing analytics match actual tracked metrics
- [ ] obvious broken/stub creation paths are removed from shipped UX

### Live

- [ ] metadata and permissions are hardened
- [ ] unsupported live tools are hidden or labeled honestly
- [ ] co-host/analytics are only shown if operationally supported

### Client polish

- [ ] shipped locales do not show raw keys
- [ ] performance is acceptable on launch-critical surfaces
- [ ] web/mobile parity claims match actual shipped scope

### Social layer

- [ ] comments/follows/DMs are only in launch scope if spam/safety minimums exist

## Trust & safety

- [ ] KYC mode is explicit: live, stub, disabled, or deferred
- [ ] moderation mode is explicit: live, stub, disabled, or deferred
- [ ] abuse/reputation mode is explicit: live, stub, disabled, or deferred
- [ ] moderation queue/escalation ownership exists
- [ ] no UI implies stronger enforcement than is actually active

## Money & commerce

- [ ] live money providers are configured for launch scope
- [ ] no money UX looks live when running stub/provider-off behavior
- [ ] critical race-sensitive flows have locking/idempotency coverage
- [ ] seller verification/disputes/support depth meets launch SLA
- [ ] ops/support can find and resolve real incidents with current lookup tools (without assuming universal processor lookup)

## Reliability & ops

- [ ] worker health is visible
- [ ] queue health is visible
- [ ] provider state is visible
- [ ] on-call runbook exists for launch-critical flows (`docs/RUNBOOK-ONCALL-MINIMUM.md` or successor)
- [ ] incident triage path is defined

## Communications

- [ ] customer emails use a real provider
- [ ] push is only promised where fully wired
- [ ] no console-only customer communication path is treated as production-ready

## Internal alignment

- [ ] one clear order-linked support model story exists
- [ ] admin/AI controls are either real or clearly read-only
- [ ] provider-not-configured handling is consistent across API + web
- [ ] DEV-only toggles are not part of production authorization
