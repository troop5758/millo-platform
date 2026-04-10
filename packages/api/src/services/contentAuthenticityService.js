'use strict';
/**
 * Content Authenticity Scoring (CAS) — 0–100 per video/livestream/post, updated as engagement arrives.
 * Bands: 80–100 highly organic, 60–79 normal, 40–59 suspicious, 20–39 likely manipulation, 0–19 confirmed manipulation.
 * Influences: feed ranking, trending eligibility, monetization eligibility, moderation alerts.
 * https://milloapp.com
 */
const db = require('@millo/database');
const engagementAuthenticityService = require('./engagementAuthenticityService');

const MIN_ENGAGEMENT_FOR_SCORE = 5;

/** Score → band. */
function getBand(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 80) return 'highly_organic';
  if (s >= 60) return 'normal';
  if (s >= 40) return 'suspicious';
  if (s >= 20) return 'likely_manipulation';
  return 'confirmed_manipulation';
}

/**
 * Gather CAS signals for a stream. Returns { factors } for scoring and { metrics } for storage (ContentAuthenticity).
 */
async function gatherSignalsForStream(streamId) {
  const sid = streamId.toString?.() || streamId;
  const factors = {
    viewerDiversity: 0,
    watchQuality: 50,
    engagementDiversity: 0,
    deviceDiversity: 50,
    geoDiversity: 50,
    temporalScore: 50,
    accountQuality: 50,
  };

  const [streamMetrics, contentEngagement, viewers, likes, comments] = await Promise.all([
    engagementAuthenticityService.getStreamEngagementMetrics(sid),
    db.ContentEngagement.findOne({ contentId: streamId, contentType: 'stream' }).lean(),
    db.LiveViewer.find({ streamId: sid }).select('userId').lean(),
    db.StreamLike.find({ streamId: sid }).select('userId createdAt').lean(),
    db.StreamComment.find({ streamId: sid, deletedAt: null }).select('userId createdAt').lean(),
  ]);

  const totalViewerSessions = viewers.length;
  const uniqueViewerIds = new Set(viewers.map((v) => v.userId?.toString()).filter(Boolean));
  const uniqueViewers = uniqueViewerIds.size;
  const totalViews = contentEngagement?.viewCount ?? totalViewerSessions;
  if (totalViewerSessions > 0 && uniqueViewers > 0) {
    factors.viewerDiversity = Math.min(1, uniqueViewers / totalViewerSessions);
  } else if (uniqueViewers > 0) {
    factors.viewerDiversity = 1;
  }

  const completionRate = contentEngagement?.completionRate ?? 0;
  const watchTime = contentEngagement?.watchTimeSeconds ?? 0;
  if (completionRate > 0 || watchTime > 0) {
    factors.watchQuality = Math.min(100, (completionRate * 100 + Math.min(100, watchTime / 60)) / 2);
  }

  if (streamMetrics.totalInteractions > 0) {
    factors.engagementDiversity = streamMetrics.engagementQuality ?? (streamMetrics.uniqueUsersInteracting / streamMetrics.totalInteractions);
  }

  const engagerIds = [...new Set([
    ...likes.map((l) => l.userId?.toString()).filter(Boolean),
    ...comments.map((c) => c.userId?.toString()).filter(Boolean),
  ])];
  let deviceDiversityPct = 50;
  if (engagerIds.length > 0) {
    const uniqueDevices = await db.DeviceFingerprint.distinct('fingerprint', { userId: { $in: engagerIds } }).then((arr) => arr.length);
    const deviceRatio = Math.min(1, uniqueDevices / Math.max(1, engagerIds.length));
    factors.deviceDiversity = Math.round(deviceRatio * 100);
    deviceDiversityPct = factors.deviceDiversity;
  }

  let temporalScore = 50;
  let suspiciousVelocity = 0;
  const allTimestamps = [...likes.map((l) => l.createdAt), ...comments.map((c) => c.createdAt)].filter(Boolean).map((d) => new Date(d).getTime());
  if (allTimestamps.length >= 5) {
    const sorted = allTimestamps.slice().sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
    const burstLike = variance < 10000 && avgGap < 5000;
    temporalScore = burstLike ? 20 : Math.min(100, 40 + Math.log10(Math.max(1, variance)) * 15);
    factors.temporalScore = temporalScore;
    suspiciousVelocity = burstLike ? 80 : Math.max(0, 100 - temporalScore);
  }

  if (engagerIds.length > 0) {
    try {
      const trustScoreEngine = require('./trustScoreEngine');
      let sum = 0;
      let count = 0;
      for (const uid of engagerIds.slice(0, 50)) {
        const { score } = await trustScoreEngine.getTrustScore(uid).catch(() => ({}));
        if (score != null) { sum += score; count++; }
      }
      if (count > 0) factors.accountQuality = Math.round(sum / count);
    } catch (_) {}
  }

  const uniqueLikes = new Set(likes.map((l) => l.userId?.toString()).filter(Boolean)).size;
  const uniqueComments = new Set(comments.map((c) => c.userId?.toString()).filter(Boolean)).size;
  const metrics = {
    uniqueViewers,
    totalViews: totalViews ?? 0,
    avgWatchTime: watchTime ?? 0,
    completionRate: (completionRate ?? 0) * 100,
    uniqueLikes,
    uniqueComments,
    deviceDiversity: deviceDiversityPct,
    geoDiversity: factors.geoDiversity ?? 50,
    suspiciousVelocity,
  };

  return { factors, metrics };
}

/**
 * Collect raw metrics for a content item (for scoring and storage).
 * Returns same shape as ContentAuthenticity.metrics.
 */
async function collectMetrics(contentId, contentType = 'stream') {
  if (contentType === 'stream') {
    const out = await gatherSignalsForStream(contentId);
    return out.metrics;
  }
  return {
    uniqueViewers: 0,
    totalViews: 0,
    avgWatchTime: 0,
    completionRate: 0,
    uniqueLikes: 0,
    uniqueComments: 0,
    deviceDiversity: 0,
    geoDiversity: 0,
    suspiciousVelocity: 0,
  };
}

/**
 * Calculate authenticity score from collected metrics.
 * Starts at 100, applies penalties: viewer ratio < 0.3 (−25), device diversity < 0.4 (−20),
 * geo diversity < 0.3 (−15), suspicious velocity > 0.7 (−30). Returns 0–100.
 */
function calculateAuthenticityFromMetrics(metrics) {
  if (!metrics) return 50;
  let score = 100;
  const totalViews = metrics.totalViews ?? 0;
  const uniqueViewers = metrics.uniqueViewers ?? 0;
  const viewerRatio = totalViews > 0 ? uniqueViewers / totalViews : 1;
  if (viewerRatio < 0.3) score -= 25;
  const deviceRatio = (metrics.deviceDiversity ?? 0) / 100;
  if (deviceRatio < 0.4) score -= 20;
  const geoRatio = (metrics.geoDiversity ?? 0) / 100;
  if (geoRatio < 0.3) score -= 15;
  const velocityRatio = (metrics.suspiciousVelocity ?? 0) / 100;
  if (velocityRatio > 0.7) score -= 30;
  return Math.max(score, 0);
}

/**
 * Calculate authenticity score for a content item (fetches metrics then applies penalty formula).
 */
async function calculateAuthenticity(contentId, contentType = 'stream') {
  const metrics = await collectMetrics(contentId, contentType);
  return calculateAuthenticityFromMetrics(metrics);
}

/**
 * Compute CAS score 0–100 from factors. Weighted blend (legacy; prefer calculateAuthenticity when using metrics).
 */
function computeScoreFromFactors(factors) {
  const w = {
    viewerDiversity: 0.2,
    watchQuality: 0.15,
    engagementDiversity: 0.25,
    deviceDiversity: 0.1,
    geoDiversity: 0.05,
    temporalScore: 0.15,
    accountQuality: 0.1,
  };
  let score = 0;
  score += (factors.viewerDiversity ?? 0) * (typeof factors.viewerDiversity === 'number' && factors.viewerDiversity <= 1 ? 100 : 1) * w.viewerDiversity;
  score += (factors.watchQuality ?? 50) / 100 * w.watchQuality * 100;
  score += (factors.engagementDiversity ?? 0) * (factors.engagementDiversity <= 1 ? 100 : 1) * w.engagementDiversity;
  score += (factors.deviceDiversity ?? 50) / 100 * w.deviceDiversity * 100;
  score += (factors.geoDiversity ?? 50) / 100 * w.geoDiversity * 100;
  score += (factors.temporalScore ?? 50) / 100 * w.temporalScore * 100;
  score += (factors.accountQuality ?? 50) / 100 * w.accountQuality * 100;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = getBand(score);
  return { score, band };
}

/** Normalize contentType for storage: stream → livestream. */
function normalizeContentType(contentType) {
  return contentType === 'stream' ? 'livestream' : contentType;
}

/**
 * Get or compute CAS for a content item. Persists when computed.
 */
async function getContentAuthenticityScore(contentId, contentType = 'stream', opts = {}) {
  if (!contentId) return { score: 50, band: 'normal', factors: {}, metrics: {} };
  const cid = contentId.toString?.() || contentId;
  const storedType = normalizeContentType(contentType);
  if (opts.skipCache) {
    const result = await computeAndPersist(cid, contentType);
    return result;
  }
  const doc = await db.ContentAuthenticity.findOne({ contentId: cid, contentType: storedType }).lean();
  if (doc) {
    const score = doc.authenticityScore ?? 50;
    return {
      score,
      band: getBand(score),
      factors: doc.metrics || {},
      metrics: doc.metrics || {},
      updatedAt: doc.lastUpdated ?? doc.updatedAt,
    };
  }
  return computeAndPersist(cid, contentType);
}

/**
 * Recompute CAS and persist. Call when engagement events arrive.
 */
async function updateContentAuthenticityScore(contentId, contentType = 'stream') {
  const cid = contentId.toString?.() || contentId;
  return computeAndPersist(cid, contentType);
}

async function computeAndPersist(contentId, contentType) {
  let factors = {};
  let metrics = {
    uniqueViewers: 0,
    totalViews: 0,
    avgWatchTime: 0,
    completionRate: 0,
    uniqueLikes: 0,
    uniqueComments: 0,
    deviceDiversity: 0,
    geoDiversity: 0,
    suspiciousVelocity: 0,
  };
  if (contentType === 'stream') {
    const out = await gatherSignalsForStream(contentId);
    factors = out.factors;
    metrics = out.metrics || metrics;
  } else {
    factors = { viewerDiversity: 50, watchQuality: 50, engagementDiversity: 50, deviceDiversity: 50, geoDiversity: 50, temporalScore: 50, accountQuality: 50 };
  }
  const score = Math.round(calculateAuthenticityFromMetrics(metrics));
  const band = getBand(score);
  const storedType = normalizeContentType(contentType);
  const now = new Date();
  await db.ContentAuthenticity.findOneAndUpdate(
    { contentId, contentType: storedType },
    { $set: { authenticityScore: score, metrics, lastUpdated: now } },
    { upsert: true }
  );
  return { score, band, factors, metrics, updatedAt: now };
}

/** Eligibility: feed ranking (score used as multiplier or filter). */
function feedRankingEligible(score) {
  return score >= 20;
}

/** Eligibility: trending (score >= 60). */
function trendingEligible(score) {
  return score >= 60;
}

const TRENDING_MIN_SCORE = 60;

/**
 * Return Set of content IDs that are eligible for trending (contentAuthenticityScore >= 60).
 * Used when building trending feed to exclude content with score < 60.
 * Content with no ContentAuthenticity doc is excluded (treated as ineligible).
 */
async function getTrendingEligibleContentIds(contentIds, contentType = 'stream') {
  if (!contentIds?.length) return new Set();
  const ids = contentIds.map((id) => (id?.toString?.() || id).toString()).filter(Boolean);
  const storedType = normalizeContentType(contentType);
  const docs = await db.ContentAuthenticity.find({
    contentId: { $in: ids },
    contentType: storedType,
    authenticityScore: { $gte: TRENDING_MIN_SCORE },
  })
    .select('contentId')
    .lean();
  return new Set(docs.map((d) => d.contentId?.toString()).filter(Boolean));
}

/**
 * Whether to exclude content from trending (score < 60).
 * When selecting trending videos, exclude content where this returns true.
 */
function excludeFromTrending(score) {
  return score != null && score < TRENDING_MIN_SCORE;
}

const DEFAULT_FEED_AUTHENTICITY_SCORE = 50;

/**
 * Batch fetch authenticity scores for content IDs. Returns Map<contentIdString, score> (0–100).
 * Missing content gets DEFAULT_FEED_AUTHENTICITY_SCORE (50). Used for feed ranking: finalScore = rankingScore * (score/100).
 */
async function getContentAuthenticityScoreMap(contentIds, contentType = 'stream') {
  const map = new Map();
  if (!contentIds?.length) return map;
  const ids = contentIds.map((id) => (id?.toString?.() || id).toString()).filter(Boolean);
  const storedType = normalizeContentType(contentType);
  const docs = await db.ContentAuthenticity.find({
    contentId: { $in: ids },
    contentType: storedType,
  })
    .select('contentId authenticityScore')
    .lean();
  for (const d of docs) {
    const cid = d.contentId?.toString?.();
    if (cid != null) map.set(cid, d.authenticityScore ?? DEFAULT_FEED_AUTHENTICITY_SCORE);
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, DEFAULT_FEED_AUTHENTICITY_SCORE);
  }
  return map;
}

/**
 * Compute feed final score: finalScore = rankingScore * (authenticityScore / 100).
 * Low authenticity heavily suppresses content.
 */
function applyAuthenticityToRankingScore(rankingScore, authenticityScore) {
  const auth = authenticityScore ?? DEFAULT_FEED_AUTHENTICITY_SCORE;
  return (rankingScore ?? 0) * (auth / 100);
}

/** Eligibility: monetization. */
function monetizationEligible(score) {
  return score >= 60;
}

/** Should trigger moderation alert. */
function moderationAlert(score) {
  return score < 40;
}

module.exports = {
  getBand,
  gatherSignalsForStream,
  collectMetrics,
  calculateAuthenticityFromMetrics,
  calculateAuthenticity,
  computeScoreFromFactors,
  getContentAuthenticityScore,
  updateContentAuthenticityScore,
  getContentAuthenticityScoreMap,
  getTrendingEligibleContentIds,
  applyAuthenticityToRankingScore,
  excludeFromTrending,
  feedRankingEligible,
  trendingEligible,
  monetizationEligible,
  moderationAlert,
  TRENDING_MIN_SCORE,
  DEFAULT_FEED_AUTHENTICITY_SCORE,
};
