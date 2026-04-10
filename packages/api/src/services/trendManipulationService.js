'use strict';
/**
 * Trend Manipulation Detection — detect when trending hashtags/tags are hijacked by coordinated bot networks.
 *
 * Signals:
 * - Hashtag burst: many posts with same tag in seconds (e.g. 500 in 60s).
 * - Creator cluster: same accounts repeatedly pushing the tag (few creators, many posts).
 * - Interaction ring: creators using the tag like each other's content (mutual likes).
 * - Geo concentration: high share of engagement from one region (e.g. 90% same country).
 *
 * Uses LiveStream.tags as hashtag source. https://milloapp.com
 */
const db = require('@millo/database');
const botGraphDetection = require('./botGraphDetection');

const BURST_WINDOW_SEC = Number(process.env.TREND_BURST_WINDOW_SEC) || 60;
const BURST_THRESHOLD = Number(process.env.TREND_BURST_THRESHOLD) || 500;
const CREATOR_CLUSTER_WINDOW_MS = Number(process.env.TREND_CREATOR_WINDOW_MS) || 24 * 60 * 60 * 1000; // 24h
const CREATOR_CONCENTRATION_THRESHOLD = Number(process.env.TREND_CREATOR_CONCENTRATION) || 0.8; // top creators = 80% of posts
const CREATOR_TOP_N = Number(process.env.TREND_CREATOR_TOP_N) || 10;
const INTERACTION_RING_MIN_EDGES = Number(process.env.TREND_INTERACTION_RING_MIN_EDGES) || 5;
const GEO_CONCENTRATION_THRESHOLD = Number(process.env.TREND_GEO_CONCENTRATION) || 0.9; // 90% from one region

/** Normalize tag for queries (lowercase, strip #). */
function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  return tag.replace(/^#/, '').trim().toLowerCase();
}

/**
 * Get streams that have the given tag, in a time window (by createdAt).
 * @param {string} tag - normalized tag
 * @param {number} [windowMs] - optional window from now
 * @returns {Promise<{ streams: Array<{ _id, userId, createdAt }>, total: number, creatorIds: string[] }>}
 */
async function getStreamsWithTag(tag, windowMs) {
  const ntag = normalizeTag(tag);
  if (!ntag) return { streams: [], total: 0, creatorIds: [] };
  const query = { tags: ntag };
  if (windowMs) {
    const since = new Date(Date.now() - windowMs);
    query.createdAt = { $gte: since };
  }
  const streams = await db.LiveStream.find(query).select('_id userId createdAt').lean();
  const creatorIds = [...new Set(streams.map((s) => s.userId?.toString()).filter(Boolean))];
  return { streams, total: streams.length, creatorIds };
}

/**
 * Hashtag burst: too many posts with same tag in a short window.
 * @param {string} tag
 * @param {number} [windowSec]
 * @param {number} [threshold]
 * @returns {Promise<{ detected: boolean, count: number, windowSec: number }>}
 */
async function detectHashtagBurst(tag, windowSec = BURST_WINDOW_SEC, threshold = BURST_THRESHOLD) {
  const windowMs = windowSec * 1000;
  const { total } = await getStreamsWithTag(tag, windowMs);
  const detected = total >= threshold;
  return { detected, count: total, windowSec };
}

/**
 * Creator cluster: few creators account for most posts with this tag.
 * @param {string} tag
 * @param {number} [windowMs]
 * @returns {Promise<{ detected: boolean, topCreatorShare: number, uniqueCreators: number, totalPosts: number }>}
 */
async function detectCreatorCluster(tag, windowMs = CREATOR_CLUSTER_WINDOW_MS) {
  const { streams, total, creatorIds } = await getStreamsWithTag(tag, windowMs);
  if (total < 10) return { detected: false, topCreatorShare: 0, uniqueCreators: creatorIds.length, totalPosts: total };
  const byCreator = new Map();
  for (const s of streams) {
    const uid = s.userId?.toString?.();
    if (uid) byCreator.set(uid, (byCreator.get(uid) || 0) + 1);
  }
  const sorted = [...byCreator.entries()].sort((a, b) => b[1] - a[1]);
  const topN = sorted.slice(0, CREATOR_TOP_N);
  const topCount = topN.reduce((sum, [, c]) => sum + c, 0);
  const topCreatorShare = total > 0 ? topCount / total : 0;
  const detected = topCreatorShare >= CREATOR_CONCENTRATION_THRESHOLD;
  return {
    detected,
    topCreatorShare: Math.round(topCreatorShare * 1000) / 1000,
    uniqueCreators: creatorIds.length,
    totalPosts: total,
  };
}

/**
 * Interaction ring: creators who use this tag mutually like each other's content.
 * @param {string} tag
 * @param {number} [windowMs]
 * @returns {Promise<{ detected: boolean, mutualEdgeCount: number, creatorCount: number }>}
 */
async function detectInteractionRing(tag, windowMs = CREATOR_CLUSTER_WINDOW_MS) {
  const { creatorIds } = await getStreamsWithTag(tag, windowMs);
  if (creatorIds.length < 3) return { detected: false, mutualEdgeCount: 0, creatorCount: creatorIds.length };
  const creatorSet = new Set(creatorIds);
  const mutualEdges = await botGraphDetection.getMutualInteractionEdges({
    windowDays: Math.ceil(windowMs / (24 * 60 * 60 * 1000)),
    minMutual: 2,
  });
  const edgesInRing = mutualEdges.filter((e) => creatorSet.has(e.u1) && creatorSet.has(e.u2));
  const detected = edgesInRing.length >= INTERACTION_RING_MIN_EDGES;
  return {
    detected,
    mutualEdgeCount: edgesInRing.length,
    creatorCount: creatorIds.length,
  };
}

/**
 * Geo concentration: high share of engagement (likes/comments) on tag content from one country.
 * Uses last known country from LoginAudit for each engaging user.
 * @param {string} tag
 * @param {number} [windowMs]
 * @returns {Promise<{ detected: boolean, topCountry: string|null, topCountryShare: number, sampleSize: number }>}
 */
async function detectGeoConcentration(tag, windowMs = CREATOR_CLUSTER_WINDOW_MS) {
  const { streams } = await getStreamsWithTag(tag, windowMs);
  const streamIds = streams.map((s) => s._id);
  if (streamIds.length === 0) return { detected: false, topCountry: null, topCountryShare: 0, sampleSize: 0 };

  const [likes, comments] = await Promise.all([
    db.StreamLike.find({ streamId: { $in: streamIds } }).select('userId').lean(),
    db.StreamComment.find({ streamId: { $in: streamIds }, deletedAt: null }).select('userId').lean(),
  ]);
  const engagerIds = [...new Set([
    ...likes.map((l) => l.userId?.toString()).filter(Boolean),
    ...comments.map((c) => c.userId?.toString()).filter(Boolean),
  ])];
  if (engagerIds.length === 0) return { detected: false, topCountry: null, topCountryShare: 0, sampleSize: 0 };

  const lastLogins = await db.LoginAudit.aggregate([
    { $match: { userId: { $in: engagerIds }, loginSuccess: true, country: { $exists: true, $ne: '' } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', country: { $first: '$country' } } },
  ]).exec();
  const countryCounts = new Map();
  for (const row of lastLogins) {
    const c = row.country || 'unknown';
    countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
  }
  const total = lastLogins.length;
  if (total < 10) return { detected: false, topCountry: null, topCountryShare: 0, sampleSize: total };
  const sorted = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const [topCountry, topCount] = sorted[0] || [null, 0];
  const topCountryShare = total > 0 ? topCount / total : 0;
  const detected = topCountryShare >= GEO_CONCENTRATION_THRESHOLD;
  return {
    detected,
    topCountry,
    topCountryShare: Math.round(topCountryShare * 1000) / 1000,
    sampleSize: total,
  };
}

/**
 * Run all trend manipulation checks for a tag. Returns signals and overall risk.
 * @param {string} tag
 * @returns {Promise<{ signals: string[], hashtagBurst: object, creatorCluster: object, interactionRing: object, geoConcentration: object }>}
 */
async function detectTrendManipulation(tag) {
  const ntag = normalizeTag(tag);
  if (!ntag) return { signals: [], hashtagBurst: {}, creatorCluster: {}, interactionRing: {}, geoConcentration: {} };

  const [hashtagBurst, creatorCluster, interactionRing, geoConcentration] = await Promise.all([
    detectHashtagBurst(ntag),
    detectCreatorCluster(ntag),
    detectInteractionRing(ntag),
    detectGeoConcentration(ntag),
  ]);

  const signals = [];
  if (hashtagBurst.detected) signals.push('hashtag_burst');
  if (creatorCluster.detected) signals.push('creator_cluster');
  if (interactionRing.detected) signals.push('interaction_ring');
  if (geoConcentration.detected) signals.push('geo_concentration');

  const result = {
    signals,
    hashtagBurst,
    creatorCluster,
    interactionRing,
    geoConcentration,
  };
  await upsertHashtagTrend(ntag, result).catch(() => {});
  return result;
}

/**
 * Upsert HashtagTrend document from detection result.
 * usageCount, uniqueCreators, geoSpread (0–100), suspiciousClusterScore (0–100), lastUpdated.
 */
async function upsertHashtagTrend(hashtag, result) {
  const ntag = normalizeTag(hashtag);
  if (!ntag) return null;
  const cc = result.creatorCluster || {};
  const geo = result.geoConcentration || {};
  const usageCount = cc.totalPosts ?? 0;
  const uniqueCreators = cc.uniqueCreators ?? 0;
  const geoSpread = geo.sampleSize > 0
    ? Math.round((1 - (geo.topCountryShare ?? 0)) * 100)
    : 0;
  const suspiciousClusterScore = Math.min(100, (result.signals?.length ?? 0) * 25);
  const lastUpdated = new Date();
  await db.HashtagTrend.findOneAndUpdate(
    { hashtag: ntag },
    { $set: { usageCount, uniqueCreators, geoSpread, suspiciousClusterScore, lastUpdated } },
    { upsert: true }
  );
  return { hashtag: ntag, usageCount, uniqueCreators, geoSpread, suspiciousClusterScore, lastUpdated };
}

/**
 * Collect hashtag stats (from HashtagTrend if present, else run detection to populate).
 * Returns usageCount, uniqueCreators, geoSpread (0–1 ratio for worker checks).
 * @param {string} hashtag
 * @returns {Promise<{ usageCount: number, uniqueCreators: number, geoSpread: number }>}
 */
async function collectHashtagStats(hashtag) {
  const ntag = normalizeTag(hashtag);
  if (!ntag) return { usageCount: 0, uniqueCreators: 0, geoSpread: 0 };
  let doc = await db.HashtagTrend.findOne({ hashtag: ntag }).lean();
  if (!doc) {
    await detectTrendManipulation(hashtag);
    doc = await db.HashtagTrend.findOne({ hashtag: ntag }).lean();
  }
  const usageCount = doc?.usageCount ?? 0;
  const uniqueCreators = doc?.uniqueCreators ?? 0;
  const geoSpread = (doc?.geoSpread ?? 0) / 100; // 0–100 → 0–1 for ratio checks
  return { usageCount, uniqueCreators, geoSpread };
}

/**
 * Flag a tag for trend manipulation. Writes FraudEvent (refType: 'hashtag', eventType: 'trend_manipulation').
 * @param {string} tag
 * @param {string} reason - e.g. 'hashtag_burst', 'creator_cluster', 'low_creator_diversity', 'geo_cluster'
 * @param {Object} [meta]
 */
async function flagTag(tag, reason, meta = {}) {
  const ntag = normalizeTag(tag);
  if (!ntag) return;
  await db.FraudEvent.create({
    userId: null,
    eventType: 'trend_manipulation',
    action: 'review',
    signals: [reason],
    refType: 'hashtag',
    refId: ntag,
    meta: { tag: ntag, reason, ...meta },
  });
}

/**
 * Run detection and flag tag if any signal fires (single FraudEvent with all signals).
 * @param {string} tag
 * @returns {Promise<{ signals: string[], flagged: boolean }>}
 */
async function checkAndFlagTrendManipulation(tag) {
  const result = await detectTrendManipulation(tag);
  if (result.signals.length > 0) {
    await db.FraudEvent.create({
      userId: null,
      eventType: 'trend_manipulation',
      action: 'review',
      signals: result.signals,
      refType: 'hashtag',
      refId: normalizeTag(tag),
      meta: {
        tag: normalizeTag(tag),
        hashtagBurst: result.hashtagBurst,
        creatorCluster: result.creatorCluster,
        interactionRing: result.interactionRing,
        geoConcentration: result.geoConcentration,
      },
    });
    return { ...result, flagged: true };
  }
  return { ...result, flagged: false };
}

/** Alias for flagTag (worker-friendly name). */
async function flagHashtag(hashtag, reason, meta = {}) {
  return flagTag(hashtag, reason, meta);
}

module.exports = {
  normalizeTag,
  getStreamsWithTag,
  collectHashtagStats,
  detectHashtagBurst,
  detectCreatorCluster,
  detectInteractionRing,
  detectGeoConcentration,
  detectTrendManipulation,
  upsertHashtagTrend,
  flagTag,
  flagHashtag,
  checkAndFlagTrendManipulation,
};
