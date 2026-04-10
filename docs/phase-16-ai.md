# Phase 16 — AI Optimization (Shadow)

**Owns:** Ranking optimizer, Bid optimizer, AI explainability, Shadow output logs.  
**Must NOT auto-apply decisions.**  
**Depends on:** Phase 7, Phase 8.

---

## Scope

- **Ranking optimizer** — suggests discovery ranking order (Phase 7); does not apply to discovery.
- **Bid optimizer** — suggests ad auction winner/bids (Phase 8); does not apply to ads delivery.
- **AI explainability** — every suggestion includes an `explanation` object (reason, shadowMode, applied: false, message).
- **Shadow output logs** — optional callback `setShadowOutputLogger(fn)`; when set, each suggestion is logged via `logShadowOutput(type, payload)` for analysis. No auto-application.
- **Kill-switch** — `AI_OPTIMIZATION_ENABLED`; when not `true`, suggestions return `disabled: true`.
- **Validation:** No auto-application — package never calls discovery or ads.

## Shadow mode

- AI optimization runs in **shadow mode**: it computes and returns suggestions only.
- **No auto-application:** The package does not depend on `@millo/discovery` or `@millo/ads`. It does not call `rank()`, `runAuction()`, or `deliver()`. Callers receive suggestion objects and would have to explicitly apply them elsewhere; this package never does that.

## Package: @millo/ai-optimization

| Export | Description |
|--------|-------------|
| `getAiOptimizationEnabled()` | Kill-switch: true only when `AI_OPTIMIZATION_ENABLED=true`. |
| `suggestRanking(items, options)` | Returns `{ applied: false, shadowMode: true, suggestedOrder, explanation }`. When disabled, `disabled: true` and empty suggestion. |
| `suggestBid(candidates, context)` | Returns `{ applied: false, shadowMode: true, suggestedWinner, suggestedBids, explanation }`. When disabled, `disabled: true`. Invokes shadow output logger when suggestion produced. |
| `setShadowOutputLogger(fn)` | Set callback for shadow output logs; `fn({ type, timestamp, ...payload })` called with type `ranking` or `bid`. |
| `getShadowOutputLogger()`, `logShadowOutput(type, payload)` | Get current logger; internal invoke (used by suggestRanking/suggestBid). |

## Shadow output logs

- **setShadowOutputLogger(fn)** — when set, `suggestRanking` and `suggestBid` call `logShadowOutput(type, payload)` with the suggestion result (type `ranking` or `bid`, plus explanation). Callers can persist to file, AuditLog, or analytics. No auto-application; logging only.

## Explainability

- **Ranking:** `explanation` includes `reason`, `shadowMode`, `applied: false`, `itemCount`, `factors`, `levelWeight`, `message`.
- **Bid:** `explanation` includes `reason`, `shadowMode`, `applied: false`, `candidateCount`, `suggestedWinnerId`, `message`.
- When kill-switch is off: `explanation.reason === 'AI_OPTIMIZATION_DISABLED'`.

## Kill-switch

- Env: `AI_OPTIMIZATION_ENABLED`. Set to `'true'` to enable suggestion computation; otherwise suggestions return `disabled: true` and no suggested order/winner.

## Validation

- `npm run validate:phase13` — runs config and no-auto-application tests, and asserts the package does not contain calls to `.rank(`, `runAuction(`, `.deliver(`, or require of `@millo/discovery` / `@millo/ads`.

## Domain

All behaviour bound to https://milloapp.com.
