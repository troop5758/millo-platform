'use strict';
/**
 * Admin Moderation Dashboard — panels for Content Authenticity and Trend Monitoring.
 * Content Authenticity Panel: authenticity score, suspicious signals, device clusters.
 * Trend Monitoring Panel: trending hashtags, suspicious hashtag spikes, creator clusters.
 * https://milloapp.com
 */
const db = require('@millo/database');

const CONTENT_PANEL_LIMIT = 50;
const TREND_PANEL_LIMIT = 30;
const ALERTS_DAYS = 7;

/**
 * Content Authenticity Panel: low-CAS content, suspicious signals (velocity_spike, device_cluster), device-cluster flags.
 */
async function getContentAuthenticityPanel(opts = {}) {
  const limit = opts.limit ?? CONTENT_PANEL_LIMIT;
  const days = opts.days ?? ALERTS_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Low authenticity content (score < 40)
  const lowAuthenticityContent = await db.ContentAuthenticity.find({
    contentType: 'livestream',
    authenticityScore: { $lt: 40 },
  })
    .sort({ lastUpdated: -1 })
    .limit(limit)
    .lean();

  // Suspicious signals: FraudEvent refType content with viewer_spike (velocity_spike, device_cluster)
  const contentAlerts = await db.FraudEvent.find({
    refType: 'content',
    eventType: 'viewer_spike',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Device clusters: events with signal device_cluster
  const deviceClusterAlerts = await db.FraudEvent.find({
    signals: 'device_cluster',
    refType: 'content',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    authenticityScore: {
      lowScoreContent: lowAuthenticityContent.map((c) => ({
        contentId: c.contentId,
        contentType: c.contentType,
        authenticityScore: c.authenticityScore,
        metrics: c.metrics,
        lastUpdated: c.lastUpdated,
      })),
      count: lowAuthenticityContent.length,
    },
    suspiciousSignals: contentAlerts.map((e) => ({
      id: e._id?.toString(),
      refId: e.refId,
      refType: e.refType,
      signals: e.signals,
      action: e.action,
      createdAt: e.createdAt,
      meta: e.meta,
    })),
    deviceClusters: deviceClusterAlerts.map((e) => ({
      id: e._id?.toString(),
      contentId: e.refId,
      signals: e.signals,
      meta: e.meta,
      createdAt: e.createdAt,
    })),
  };
}

/**
 * Trend Monitoring Panel: trending hashtags, suspicious hashtag spikes (trend_manipulation alerts), creator clusters.
 */
async function getTrendMonitoringPanel(opts = {}) {
  const limit = opts.limit ?? TREND_PANEL_LIMIT;
  const days = opts.days ?? ALERTS_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Trending hashtags (HashtagTrend sorted by usageCount)
  const trendingHashtags = await db.HashtagTrend.find({})
    .sort({ usageCount: -1 })
    .limit(limit)
    .lean();

  // Suspicious hashtag spikes: FraudEvent trend_manipulation (hashtag_burst, etc.)
  const suspiciousSpikes = await db.FraudEvent.find({
    eventType: 'trend_manipulation',
    refType: 'hashtag',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Creator clusters: trend_manipulation with creator_cluster or low_creator_diversity
  const creatorClusterAlerts = await db.FraudEvent.find({
    eventType: 'trend_manipulation',
    refType: 'hashtag',
    $or: [{ signals: 'creator_cluster' }, { signals: 'low_creator_diversity' }],
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    trendingHashtags: trendingHashtags.map((h) => ({
      hashtag: h.hashtag,
      usageCount: h.usageCount,
      uniqueCreators: h.uniqueCreators,
      geoSpread: h.geoSpread,
      suspiciousClusterScore: h.suspiciousClusterScore,
      lastUpdated: h.lastUpdated,
    })),
    suspiciousHashtagSpikes: suspiciousSpikes.map((e) => ({
      id: e._id?.toString(),
      tag: e.refId,
      signals: e.signals,
      action: e.action,
      createdAt: e.createdAt,
      meta: e.meta,
    })),
    creatorClusters: creatorClusterAlerts.map((e) => ({
      id: e._id?.toString(),
      tag: e.refId,
      signals: e.signals,
      meta: e.meta,
      createdAt: e.createdAt,
    })),
  };
}

/**
 * Combined moderation dashboard (both panels). For single-request dashboard load.
 */
async function getModerationDashboard(opts = {}) {
  const [contentAuthenticity, trendMonitoring] = await Promise.all([
    getContentAuthenticityPanel(opts),
    getTrendMonitoringPanel(opts),
  ]);
  return {
    contentAuthenticity,
    trendMonitoring,
  };
}

module.exports = {
  getContentAuthenticityPanel,
  getTrendMonitoringPanel,
  getModerationDashboard,
};
