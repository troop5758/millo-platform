# Phase 3 — Level & Trust Engine

**Owns:** XP calculation, Trust scoring, Trust tiers, Feature gating, Decay workers, Abuse penalty hooks, Audit logs.  
**Must NOT include:** Live streaming, Commerce.  
**Depends on:** Phase 2.

---

## Server-side scoring

- **Level:** `packages/level-trust/src/scoring.js` — `getLevel(userId)`, `addXp(userId, amount, source)`. XP per level: 100 (see `constants.js`). Level-up when XP ≥ threshold.
- **Trust:** `getTrust(userId)` = sum of `TrustScore` entries for user; `addTrust(userId, amount, source)` appends a `TrustScore` and audits.

## Trust tiers

- **Constants:** `packages/level-trust/src/constants.js` — `TRUST_TIERS` (new, member, trusted, veteran), `trustTierForScore(score)`.
- **Scoring:** `getTrustTier(userId)` returns `{ name, minScore, nextTierAt }`.
- **Gating:** `checkTrustTier(userId, minTierName)`, `requireTrustTier(userId, minTierName)`; 403 `TRUST_TIER_GATE_FAILED` when tier is below minimum.
- **API:** `GET /trust/:userId` includes `tier`; `POST /gated` accepts `minTier` in body.

## BullMQ decay workers

- **Queue:** `trust-decay` (`packages/workers/src/queues.js`).
- **Worker:** `packages/workers/src/decay-worker.js` — processes jobs `{ userId, amount }` with `amount` negative; calls `levelTrust.addTrust(userId, amount, 'decay')`. Audit logging via `addTrust` → `AuditLog`.
- Workers start: `packages/workers/src/index.js` (connects DB, then starts decay worker).

## Abuse penalty hooks

- **Module:** `packages/level-trust/src/abuseHooks.js` — `registerAbusePenaltyHook(fn)`, `applyAbusePenalty(userId, reason)`.
- **Default:** applies trust deduction (`abuse_penalty` source) and writes `AuditLog` with `action: 'trust.abuse_penalty'`, then runs all registered hooks. No live or commerce logic.

## Audit logging

- **addXp:** `AuditLog` — `action: 'level.xp.add'`, `resourceType: 'Level'`, `meta: { amount, source, level, xp }`.
- **addTrust:** `AuditLog` — `action: 'trust.add'`, `resourceType: 'TrustScore'`, `meta: { amount, source, total }`.
- **applyAbusePenalty:** `AuditLog` — `action: 'trust.abuse_penalty'`, `meta: { reason, trustPenalty }`.
- Decay jobs use `addTrust(..., 'decay')`, so decay is audited.

## Feature gating

- **Gate API:** `checkLevel`, `checkTrust`, `checkTrustTier`, `requireLevel`, `requireTrust`, `requireTrustTier` in `packages/level-trust/src/gate.js` (logic in `gateCore.js`).
- **API:** `packages/api/src/routes/levelTrust.js` — `POST /gated` body `{ userId, minLevel?, minTrust?, minTier? }`; returns **403** on `LEVEL_GATE_FAILED`, `TRUST_GATE_FAILED`, or `TRUST_TIER_GATE_FAILED`; 200 when gate passes.

## Validation

- **Unit tests:** `npm run test:level-trust` — constants (XP + trust tiers) and gate (level, trust, trust tier) tests; no DB required.
- **Phase 3 script:** `npm run validate:phase3` runs the same tests and confirms gating is enforced per doc.

Run from repo root: `npm run test:level-trust` or `npm run validate:phase3`.

---

*Phase 3 complete. No live streaming or commerce. Proceed to next phase in specified order.*
