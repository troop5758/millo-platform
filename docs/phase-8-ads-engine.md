# Phase 8 — Live Discovery Ads

**Owns:** Ad auction, Budget pacing, Attribution, Kill-switch.  
**Depends on:** Phase 7.

---

## Ad auction

- **API:** `runAuction(candidates)` — candidates have `bidCents`; winner is highest bid. Returns winning candidate or null.
- **Location:** `packages/ads/src/auction.js`. Used by `deliver()` for live discovery ad selection.

## Budget pacing

- **API:** `getSpendToday(campaignId)`, `canSpend(campaignId, dailyBudgetCents)`, `recordSpend(campaignId, amountCents)`.
- **Schema:** AdDailySpend (campaignId, date, amountCents) — unique per campaign per day; caps daily spend.
- **Location:** `packages/ads/src/budgetPacing.js`. Delivery filters candidates by `canSpend` before auction.

## Attribution

- **logImpression(adId, { userId?, anonymousId? })** — writes to AdImpression.
- **logAttribution(adId, campaignId, { userId?, conversionId?, conversionType? })** — writes to AuditLog with action `ad_attribution`.
- **Location:** `packages/ads/src/attribution.js`. Delivery calls logImpression on successful serve; callers may call logAttribution for conversions.

## Kill-switch

- **Env:** `ADS_ENABLED`. When set to `'false'`, `getAdsEnabled()` returns false and **deliver() returns null** (no ad served).
- **Location:** `packages/ads/src/config.js`; `delivery.js` checks at start of `deliver()`.

## Delivery

- **deliver(placement, candidates, context)** — if kill-switch off, filters candidates by budget pacing, runs auction, records spend, logs impression, returns `{ adId, campaignId, costCents }`. If kill-switch on, returns null. `placement` can denote live discovery context (e.g. discovery feed, live stream).
- **Location:** `packages/ads/src/delivery.js`.

## Validation

- **Kill-switch halts delivery:** When `ADS_ENABLED=false`, `getAdsEnabled()` returns false and `deliver()` returns null. Unit tests in `packages/ads/src/delivery.test.js`.

Run: `node --test packages/ads/src/delivery.test.js` or `npm run validate:phase8`.

---

*Phase 8 complete. Proceed to next phase in specified order.*
