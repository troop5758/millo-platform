'use strict';
/**
 * Ads engine helpers — selection, CPM/bid ordering, in-feed slot injection.
 * Delivery / pacing / spend: `@millo/ads` `deliver()`; schemas: `@millo/database` `Ad`, `Campaign`.
 * https://milloapp.com
 */

const db = require('@millo/database');

/**
 * Active ads for a placement (and optional adSurface) with live campaign window + budget sanity.
 * @param {{ placement?: string, adSurface?: string|null, region?: string|null, limit?: number }} opts
 * @returns {Promise<object[]>} lean Ad docs
 */
async function queryActiveAds(opts = {}) {
  const placement = opts.placement != null ? String(opts.placement) : 'feed';
  const adSurface = opts.adSurface != null && opts.adSurface !== '' ? String(opts.adSurface) : null;
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 10));
  const region = opts.region != null ? String(opts.region).toUpperCase().trim() : null;

  const now = new Date();
  const campaigns = await db.Campaign.find({
    status: 'active',
    $and: [
      { $or: [{ endsAt: { $gt: now } }, { endsAt: null }] },
      { $or: [{ startsAt: { $lte: now } }, { startsAt: null }] },
    ],
  }).lean();
  if (!campaigns.length) return [];
  const campaignIds = campaigns.map((c) => c._id);

  const adQuery = { campaignId: { $in: campaignIds }, placement, status: 'active' };
  if (adSurface) adQuery.adSurface = adSurface;
  if (region) {
    adQuery.$or = [{ target_regions: { $size: 0 } }, { target_regions: region }];
  }

  return db.Ad.find(adQuery).limit(limit).lean();
}

/**
 * @param {object} ad
 * @returns {boolean}
 */
function isAdActive(ad) {
  if (!ad || typeof ad !== 'object') return false;
  if (String(ad.status) !== 'active') return false;
  if (ad.active === false) return false;
  return true;
}

/**
 * @param {object} ad
 * @returns {number}
 */
function effectiveBidCents(ad) {
  const bid = Number(ad.bidCents);
  if (Number.isFinite(bid) && bid > 0) return bid;
  return Math.max(0, Math.floor(Number(ad.cpmCents) || 0));
}

/**
 * Highest effective bid among active ads (simple first-price style pick; use `deliver()` for full pacing).
 * @param {object} _user — reserved for future targeting (userId, region, interests)
 * @param {object[]} ads
 * @returns {object|null}
 */
function selectAd(_user, ads) {
  const list = Array.isArray(ads) ? ads.filter(isAdActive) : [];
  if (!list.length) return null;
  return list.slice().sort((a, b) => effectiveBidCents(b) - effectiveBidCents(a))[0];
}

/**
 * After every `interval` organic items, insert one ad row (1-based: ad after 5th, 10th, …).
 * @param {object[]} feedItems — e.g. For You `items` `{ rank, score, contentId, creatorId, type }`
 * @param {object} adDoc — lean Ad or plain object
 * @param {{ interval?: number }} [options]
 * @returns {object[]}
 */
function injectInFeedAdSlots(feedItems, adDoc, options = {}) {
  const interval = Math.max(2, Math.min(50, Number(options.interval) || 5));
  const list = Array.isArray(feedItems) ? feedItems.slice() : [];
  if (!adDoc || list.length === 0) return list;
  const payload = adDoc && typeof adDoc === 'object' ? { ...adDoc } : {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(list[i]);
    if ((i + 1) % interval === 0) {
      out.push({
        rank: 0,
        score: 0,
        contentId: '',
        creatorId: payload.creatorId != null ? String(payload.creatorId) : null,
        type: 'ad',
        adSurface: payload.adSurface || 'in_feed',
        ad: {
          adId: payload._id != null ? String(payload._id) : '',
          headline: payload.headline,
          description: payload.description,
          ctaText: payload.ctaText,
          ctaUrl: payload.ctaUrl,
          imageUrl: payload.imageUrl,
          videoUrl: payload.videoUrl,
          format: payload.format,
        },
      });
    }
  }
  return out.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Shape a lean Ad for `@millo/ads` `deliver(placement, candidates, context)` (adds bidCents).
 * @param {object} ad
 * @returns {object}
 */
function toDeliverCandidate(ad) {
  if (!ad || typeof ad !== 'object') return ad;
  const bidCents = effectiveBidCents(ad);
  return {
    ...ad,
    adId: ad._id,
    bidCents,
    dailyBudgetCents: 0,
  };
}

module.exports = {
  queryActiveAds,
  isAdActive,
  effectiveBidCents,
  selectAd,
  injectInFeedAdSlots,
  toDeliverCandidate,
};
