'use strict';
/**
 * Dynamic pricing engine (advanced) — blends demand, live viewers, engagement, and creator popularity
 * into an uplift multiplier on a base price to prioritize revenue under load.
 *
 * - **`dynamicPrice(basePrice, demandScore)`** — dollar-style tutorial API:
 *   `dynamicPrice(10, 50)` → `15` (50% uplift).
 * - **`dynamicPriceCents(baseCents, signals)`** — production path: **integer cents**, min/max caps,
 *   off by default until **`DYNAMIC_PRICING_ENABLED=true`** (safe default).
 *
 * Signals object (all optional, each normalized to 0–100 where noted):
 * - `demandScore` | `demand` — backlog / conversion / inventory pressure (0–100)
 * - `viewerCount` — concurrent or recent viewers; compressed via log scale vs `viewerRefMax` (default 10k)
 * - `engagementScore` | `engagement` — likes/min, chat velocity, watch-time proxy (0–100)
 * - `creatorPopularity` | `popularity` — followers, CRS, or tier rank (0–100)
 *
 * Weights default: demand 35%, engagement 25%, viewers 20%, popularity 20% (override via `opts.weights`).
 * https://milloapp.com
 */

/** @type {Record<string, number>} */
const DEFAULT_WEIGHTS = {
  demand: 0.35,
  engagement: 0.25,
  viewers: 0.2,
  popularity: 0.2,
};

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * @param {unknown} demandScore
 */
function normalizeDemand(demandScore) {
  if (demandScore == null || !Number.isFinite(Number(demandScore))) return 0;
  return clamp(Number(demandScore), 0, 100);
}

/**
 * @param {unknown} engagementScore
 */
function normalizeEngagement(engagementScore) {
  if (engagementScore == null || !Number.isFinite(Number(engagementScore))) return 0;
  return clamp(Number(engagementScore), 0, 100);
}

/**
 * @param {unknown} popularityScore
 */
function normalizePopularity(popularityScore) {
  if (popularityScore == null || !Number.isFinite(Number(popularityScore))) return 0;
  return clamp(Number(popularityScore), 0, 100);
}

/**
 * Map viewer count to ~0..100 using log compression (stable for large streams).
 * @param {unknown} viewerCount
 * @param {number} [refMax]
 */
function normalizeViewerCount(viewerCount, refMax = 10000) {
  if (viewerCount == null || !Number.isFinite(Number(viewerCount))) return 0;
  const cap = Math.max(1, Number(refMax) || 10000);
  return clamp((Math.log1p(Number(viewerCount)) / Math.log1p(cap)) * 100, 0, 100);
}

/**
 * Weighted blend → single 0..100 demand index.
 * If the caller passes **only a subset** of signals (e.g. just `demandScore`), weights are
 * renormalized over those keys so `demandScore: 100` alone matches {@link dynamicPrice} uplift semantics.
 * If **no** signal keys are present, falls back to the full four-channel blend with absent values treated as 0.
 * @param {Record<string, unknown>} [signals]
 * @param {Partial<typeof DEFAULT_WEIGHTS>} [weights]
 */
function computeDemandIndex(signals = {}, weights = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const has = (k) => Object.prototype.hasOwnProperty.call(signals, k);

  const explicitChannels = [];
  if (has('demandScore') || has('demand')) {
    explicitChannels.push({
      v: normalizeDemand(signals.demandScore ?? signals.demand),
      w: w.demand,
    });
  }
  if (has('engagementScore') || has('engagement')) {
    explicitChannels.push({
      v: normalizeEngagement(signals.engagementScore ?? signals.engagement),
      w: w.engagement,
    });
  }
  if (has('viewerCount')) {
    explicitChannels.push({
      v: normalizeViewerCount(signals.viewerCount, signals.viewerRefMax),
      w: w.viewers,
    });
  }
  if (has('creatorPopularity') || has('popularity')) {
    explicitChannels.push({
      v: normalizePopularity(signals.creatorPopularity ?? signals.popularity),
      w: w.popularity,
    });
  }

  if (explicitChannels.length > 0) {
    let num = 0;
    let den = 0;
    for (const c of explicitChannels) {
      num += c.v * c.w;
      den += c.w;
    }
    return den <= 0 ? 0 : clamp(num / den, 0, 100);
  }

  const sum = w.demand + w.engagement + w.viewers + w.popularity;
  if (sum <= 0) return 0;

  const d = normalizeDemand(signals.demandScore ?? signals.demand);
  const e = normalizeEngagement(signals.engagementScore ?? signals.engagement);
  const v = normalizeViewerCount(signals.viewerCount, signals.viewerRefMax);
  const p = normalizePopularity(signals.creatorPopularity ?? signals.popularity);

  return clamp(
    (d * w.demand + e * w.engagement + v * w.viewers + p * w.popularity) / sum,
    0,
    100
  );
}

/**
 * `basePrice * (1 + demandScore / 100)` — e.g. `dynamicPrice(10, 50)` → `15`.
 * @param {number} basePrice
 * @param {number} demandScore — 0–100; values outside range are clamped
 */
function dynamicPrice(basePrice, demandScore) {
  const b = Number(basePrice);
  const d = clamp(Number(demandScore) || 0, 0, 100);
  if (!Number.isFinite(b) || b < 0) return 0;
  return b * (1 + d / 100);
}

/**
 * Apply dynamic uplift to a **base price in integer cents**. When disabled, returns `baseCents` unchanged.
 * @param {number} baseCents
 * @param {Record<string, unknown>} [signals]
 * @param {{
 *   enabled?: boolean,
 *   maxUpliftPercent?: number,
 *   minCents?: number,
 *   maxCents?: number,
 *   weights?: Partial<typeof DEFAULT_WEIGHTS>,
 * } | undefined} [opts]
 */
function dynamicPriceCents(baseCents, signals = {}, opts = {}) {
  const g = Math.floor(Number(baseCents));
  if (!Number.isFinite(g) || g < 0) return 0;

  const enabled = opts.enabled ?? process.env.DYNAMIC_PRICING_ENABLED === 'true';
  if (!enabled) return g;

  const maxUpliftPercent = clamp(
    Number(opts.maxUpliftPercent ?? process.env.DYNAMIC_PRICING_MAX_UPLIFT_PCT ?? 50),
    0,
    200
  );
  const minCents = opts.minCents != null ? Math.max(0, Math.floor(opts.minCents)) : 1;
  const maxCents =
    opts.maxCents != null ? Math.max(minCents, Math.floor(opts.maxCents)) : Number.MAX_SAFE_INTEGER;

  const idx = computeDemandIndex(signals, opts.weights || {});
  const uplift = clamp(idx, 0, maxUpliftPercent);
  const mult = 1 + uplift / 100;
  const out = Math.round(g * mult);
  return clamp(out, minCents, maxCents);
}

module.exports = {
  DEFAULT_WEIGHTS,
  clamp,
  normalizeDemand,
  normalizeEngagement,
  normalizeViewerCount,
  normalizePopularity,
  computeDemandIndex,
  dynamicPrice,
  dynamicPriceCents,
};
