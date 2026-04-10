'use strict';
/**
 * Final pass after ranking — monetization & policy density (ads, commerce, live, creator caps).
 * Greedy left-to-right: preserves rank order where possible by dropping violating rows.
 * https://milloapp.com
 */

function typeOf(row) {
  return String(row?.item?.type || 'short').toLowerCase();
}

function creatorOf(row) {
  return row?.item?.creatorId != null ? String(row.item.creatorId) : '';
}

/**
 * Effective max live slots in a sliding window, scaled down when user skips lives often.
 * @param {number} baseMax
 * @param {number} [userLiveSkipRate] - 0..1 (e.g. share of live impressions skipped fast)
 * @returns {number}
 */
function effectiveLiveWindowCap(baseMax, userLiveSkipRate) {
  const m = Math.max(0, Math.floor(Number(baseMax) || 0));
  if (m <= 0) return 0;
  const r = Number(userLiveSkipRate);
  if (!Number.isFinite(r) || r <= 0) return m;
  const factor = 1 - Math.min(0.85, Math.max(0, r));
  return Math.max(0, Math.floor(m * factor));
}

/**
 * @typedef {object} BusinessRulesOptions
 * @property {boolean} [hideCommerce] - Remove `type === 'product'`
 * @property {number} [adsEveryNSlots] - At most 1 `ad` per this many consecutive slots (0 = off)
 * @property {number} [maxPerCreatorInWindow] - Max items per creator in sliding window (default 2)
 * @property {number} [creatorWindowSize] - Window length (default 20)
 * @property {number} [maxCommerceInWindow] - Max `product` in window (default 2, 0 = off)
 * @property {number} [commerceWindowSize] - Default 20
 * @property {number} [maxLiveInWindow] - Max `live` in window before skip-rate scaling
 * @property {number} [liveWindowSize] - Default 20
 * @property {number} [maxLiveTotal] - Hard cap on `live` in entire feed
 * @property {number} [maxAdsTotal] - Hard cap on `ad` in entire feed
 * @property {number} [userLiveSkipRate] - Reduces `maxLiveInWindow` when high
 */

/**
 * @param {Array<{ item: object, features?: object, scores?: object }>} rows
 * @param {BusinessRulesOptions} [options]
 * @returns {typeof rows}
 */
function applyBusinessRules(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const hideCommerce = options.hideCommerce === true;
  const adsEveryNSlots = Math.max(0, Number(options.adsEveryNSlots) || 0);
  const maxPerCreatorInWindow = Math.max(1, Number(options.maxPerCreatorInWindow) || 2);
  const creatorWindowSize = Math.max(2, Number(options.creatorWindowSize) || 20);
  const maxCommerceInWindow = options.maxCommerceInWindow != null ? Math.max(0, Number(options.maxCommerceInWindow)) : 2;
  const commerceWindowSize = Math.max(2, Number(options.commerceWindowSize) || 20);
  const baseLiveCap = options.maxLiveInWindow != null ? Number(options.maxLiveInWindow) : 3;
  const liveWindowSize = Math.max(2, Number(options.liveWindowSize) || 20);
  const maxLiveInWindow = effectiveLiveWindowCap(baseLiveCap, options.userLiveSkipRate);
  const maxLiveTotal = Number.isFinite(Number(options.maxLiveTotal)) ? Math.max(0, Number(options.maxLiveTotal)) : Infinity;
  const maxAdsTotal = Number.isFinite(Number(options.maxAdsTotal)) ? Math.max(0, Number(options.maxAdsTotal)) : Infinity;

  const out = [];
  let liveTotal = 0;
  let adsTotal = 0;

  for (const row of rows) {
    const t = typeOf(row);

    if (hideCommerce && t === 'product') continue;

    if (t === 'live' && liveTotal >= maxLiveTotal) continue;
    if (t === 'ad' && adsTotal >= maxAdsTotal) continue;

    const cid = creatorOf(row);
    if (cid && creatorWindowSize > 1) {
      const tail = out.slice(-(creatorWindowSize - 1));
      const sameCreator = tail.filter((r) => creatorOf(r) === cid).length;
      if (sameCreator >= maxPerCreatorInWindow) continue;
    }

    if (maxCommerceInWindow > 0 && commerceWindowSize > 1 && t === 'product') {
      const tail = out.slice(-(commerceWindowSize - 1));
      const commerceCount = tail.filter((r) => typeOf(r) === 'product').length;
      if (commerceCount >= maxCommerceInWindow) continue;
    }

    if (maxLiveInWindow > 0 && liveWindowSize > 1 && t === 'live') {
      const tail = out.slice(-(liveWindowSize - 1));
      const liveCount = tail.filter((r) => typeOf(r) === 'live').length;
      if (liveCount >= maxLiveInWindow) continue;
    }

    if (adsEveryNSlots > 1 && t === 'ad') {
      const tail = out.slice(-(adsEveryNSlots - 1));
      const adCount = tail.filter((r) => typeOf(r) === 'ad').length;
      if (adCount >= 1) continue;
    }

    out.push(row);
    if (t === 'live') liveTotal += 1;
    if (t === 'ad') adsTotal += 1;
  }

  return out;
}

module.exports = {
  applyBusinessRules,
  effectiveLiveWindowCap,
};
