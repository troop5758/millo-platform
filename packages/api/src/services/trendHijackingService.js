'use strict';
/**
 * Trend Hijacking Protection — prevent spam accounts from hijacking trending hashtags.
 * Rules: new account + viral hashtag → lower ranking weight; low trust + trending tag → suppressed.
 * https://milloapp.com
 */
const db = require('@millo/database');
const trustScoreEngine = require('./trustScoreEngine');
const trendManipulationService = require('./trendManipulationService');

const NEW_ACCOUNT_DAYS = Number(process.env.TREND_HIJACK_NEW_ACCOUNT_DAYS) || 14;
const VIRAL_TAG_MIN_USAGE = Number(process.env.TREND_HIJACK_VIRAL_MIN_USAGE) || 500;
const TRENDING_TAG_MIN_USAGE = Number(process.env.TREND_HIJACK_TRENDING_MIN_USAGE) || 100;
const LOW_TRUST_THRESHOLD = Number(process.env.TREND_HIJACK_LOW_TRUST_THRESHOLD) || 40;
const NEW_ACCOUNT_VIRAL_WEIGHT = Number(process.env.TREND_HIJACK_NEW_ACCOUNT_WEIGHT) || 0.3; // lower ranking weight
const LOW_TRUST_TRENDING_WEIGHT = 0; // suppressed

let _viralTagSet = null;
let _viralTagSetAt = 0;
const VIRAL_CACHE_MS = 5 * 60 * 1000; // 5 min

/**
 * Set of hashtag strings considered "viral" (high usage). Cached briefly.
 */
async function getViralTagSet() {
  const now = Date.now();
  if (_viralTagSet && now - _viralTagSetAt < VIRAL_CACHE_MS) return _viralTagSet;
  const docs = await db.HashtagTrend.find({ usageCount: { $gte: VIRAL_TAG_MIN_USAGE } })
    .select('hashtag')
    .lean();
  _viralTagSet = new Set(docs.map((d) => (d.hashtag || '').toLowerCase()).filter(Boolean));
  _viralTagSetAt = now;
  return _viralTagSet;
}

/**
 * Set of hashtag strings considered "trending" (used in HashtagTrend above threshold). Same as viral for now; can use lower threshold.
 */
async function getTrendingTagSet() {
  const docs = await db.HashtagTrend.find({ usageCount: { $gte: TRENDING_TAG_MIN_USAGE } })
    .select('hashtag')
    .lean();
  return new Set(docs.map((d) => (d.hashtag || '').toLowerCase()).filter(Boolean));
}

/**
 * Whether the creator account is "new" (created within NEW_ACCOUNT_DAYS).
 */
async function isNewAccount(creatorId) {
  if (!creatorId) return false;
  const user = await db.User.findById(creatorId).select('createdAt').lean();
  if (!user?.createdAt) return false;
  const cutoff = new Date(Date.now() - NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
  return new Date(user.createdAt) >= cutoff;
}

/**
 * Whether content tags include any viral (high-usage) tag.
 */
function hasViralTag(tags, viralSet) {
  if (!tags?.length || !viralSet?.size) return false;
  for (const t of tags) {
    const n = trendManipulationService.normalizeTag(t);
    if (n && viralSet.has(n)) return true;
  }
  return false;
}

/**
 * Single-item: get trend hijacking multiplier for (creatorId, contentTags).
 * Returns 0 (suppressed), NEW_ACCOUNT_VIRAL_WEIGHT (e.g. 0.3), or 1.
 */
async function getTrendHijackingMultiplier(creatorId, contentTags) {
  const tags = Array.isArray(contentTags) ? contentTags : [];
  if (tags.length === 0) return 1;

  const [viralSet, trendingSet, newAccount, trustResult] = await Promise.all([
    getViralTagSet(),
    getTrendingTagSet(),
    isNewAccount(creatorId),
    trustScoreEngine.getTrustScore(creatorId).catch(() => ({ score: 0 })),
  ]);

  const hasViral = hasViralTag(tags, viralSet);
  const hasTrending = hasViralTag(tags, trendingSet);
  const trustScore = trustResult?.score ?? 0;
  const lowTrust = trustScore < LOW_TRUST_THRESHOLD;

  // Rule 2: low trust + trending tag → suppressed
  if (lowTrust && hasTrending) return LOW_TRUST_TRENDING_WEIGHT;
  // Rule 1: new account + viral tag → lower ranking weight
  if (newAccount && hasViral) return NEW_ACCOUNT_VIRAL_WEIGHT;
  return 1;
}

/**
 * Batch: get trend hijacking multipliers for feed items. Items must have id, creatorId (or stream.userId), and stream.tags.
 * Returns Map<itemIdString, number> (multiplier 0–1).
 */
async function getTrendHijackingMultipliersForItems(items) {
  const map = new Map();
  if (!items?.length) return map;

  const creatorIds = [...new Set(items.map((i) => i.creatorId || i.stream?.userId).filter(Boolean))];
  const [viralSet, trendingSet, users, trustScores] = await Promise.all([
    getViralTagSet(),
    getTrendingTagSet(),
    db.User.find({ _id: { $in: creatorIds } }).select('_id createdAt').lean(),
    Promise.all(creatorIds.map((cid) => trustScoreEngine.getTrustScore(cid).then((r) => ({ id: cid, score: r?.score ?? 0 })).catch(() => ({ id: cid, score: 0 })))),
  ]);

  const userCreatedAt = Object.fromEntries(users.map((u) => [String(u._id), u.createdAt]));
  const trustByCreator = Object.fromEntries(trustScores.map((t) => [String(t.id), t.score]));
  const cutoff = new Date(Date.now() - NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);

  for (const item of items) {
    const cid = String(item.creatorId || item.stream?.userId || '');
    const tags = item.stream?.tags || item.tags || [];
    const itemId = item.id?.toString?.() || item._id?.toString?.() || '';
    if (!tags.length) {
      map.set(itemId, 1);
      continue;
    }
    const hasViral = hasViralTag(tags, viralSet);
    const hasTrending = hasViralTag(tags, trendingSet);
    const createdAt = userCreatedAt[cid];
    const newAccount = createdAt ? new Date(createdAt) >= cutoff : false;
    const trustScore = trustByCreator[cid] ?? 0;
    const lowTrust = trustScore < LOW_TRUST_THRESHOLD;

    let mult = 1;
    if (lowTrust && hasTrending) mult = LOW_TRUST_TRENDING_WEIGHT;
    else if (newAccount && hasViral) mult = NEW_ACCOUNT_VIRAL_WEIGHT;
    map.set(itemId, mult);
  }
  return map;
}

module.exports = {
  getViralTagSet,
  getTrendingTagSet,
  isNewAccount,
  getTrendHijackingMultiplier,
  getTrendHijackingMultipliersForItems,
  NEW_ACCOUNT_DAYS,
  VIRAL_TAG_MIN_USAGE,
  TRENDING_TAG_MIN_USAGE,
  LOW_TRUST_THRESHOLD,
  NEW_ACCOUNT_VIRAL_WEIGHT,
};
