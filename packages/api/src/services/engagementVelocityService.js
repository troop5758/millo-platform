'use strict';
/**
 * Engagement Velocity Detection — flags fake virality from unnatural view spikes.
 * Compares last-minute view rate to average over last hour; spike ratio > 15 → flag.
 * https://milloapp.com
 */
const db = require('@millo/database');

const SPIKE_RATIO_THRESHOLD = Number(process.env.ENGAGEMENT_VELOCITY_SPIKE_RATIO) || 15;
const DEVICE_CLUSTER_RATIO_THRESHOLD = Number(process.env.DEVICE_CLUSTER_RATIO_THRESHOLD) || 0.2;
const DEVICE_CLUSTER_MIN_INTERACTIONS = Number(process.env.DEVICE_CLUSTER_MIN_INTERACTIONS) || 10;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/**
 * Get view timeline for content: last-minute count and average views per minute over last hour.
 * For streams uses LiveViewer joinedAt; other types return zeros until view events exist.
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ lastMinute: number, lastHour: number, avgLastHour: number }>}
 */
async function getViewTimeline(contentId, contentType = 'stream') {
  const now = new Date();
  const oneMinAgo = new Date(now.getTime() - ONE_MINUTE_MS);
  const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);

  if (contentType === 'stream') {
    const sid = contentId.toString?.() || contentId;
    const [lastMinute, lastHour] = await Promise.all([
      db.LiveViewer.countDocuments({ streamId: sid, joinedAt: { $gte: oneMinAgo } }),
      db.LiveViewer.countDocuments({ streamId: sid, joinedAt: { $gte: oneHourAgo } }),
    ]);
    const avgLastHour = lastHour / 60; // avg views per minute over last hour
    return { lastMinute, lastHour, avgLastHour };
  }

  return { lastMinute: 0, lastHour: 0, avgLastHour: 0 };
}

/**
 * Detect if content has an unnatural velocity spike (last minute >> avg per minute in last hour).
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ spike: boolean, ratio: number, lastMinute: number, avgLastHour: number }>}
 */
async function detectVelocitySpike(contentId, contentType = 'stream') {
  const views = await getViewTimeline(contentId, contentType);
  const { lastMinute, avgLastHour } = views;
  const safeAvg = avgLastHour > 0 ? avgLastHour : 1;
  const spikeRatio = lastMinute / safeAvg;
  const spike = spikeRatio > SPIKE_RATIO_THRESHOLD;
  return {
    spike,
    ratio: Math.round(spikeRatio * 100) / 100,
    lastMinute: views.lastMinute,
    avgLastHour: Math.round(views.avgLastHour * 100) / 100,
  };
}

/**
 * Flag content for velocity spike (or other reason). Writes FraudEvent for audit and review.
 * @param {string|ObjectId} contentId
 * @param {string} reason - e.g. 'velocity_spike'
 * @param {Object} [meta] - optional extra (e.g. ratio, lastMinute)
 */
async function flagContent(contentId, reason, meta = {}) {
  const refId = contentId.toString?.() || contentId;
  await db.FraudEvent.create({
    userId: null,
    eventType: 'viewer_spike',
    action: 'review',
    signals: [reason],
    refType: 'content',
    refId,
    meta: { reason, ...meta },
  });
}

/**
 * Run velocity check and flag if spike detected. Returns detection result.
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ spike: boolean, ratio: number, flagged: boolean }>}
 */
async function checkAndFlagVelocity(contentId, contentType = 'stream') {
  const result = await detectVelocitySpike(contentId, contentType);
  if (result.spike) {
    await flagContent(contentId, 'velocity_spike', {
      ratio: result.ratio,
      lastMinute: result.lastMinute,
      avgLastHour: result.avgLastHour,
    });
    return { ...result, flagged: true };
  }
  return { ...result, flagged: false };
}

/**
 * Detect device cluster: many interactions from few distinct devices (bot-like pattern).
 * ratio = uniqueDevices / interactions.length; if ratio < threshold (default 0.2), flag.
 * For streams uses StreamLike + StreamComment; devices = distinct DeviceFingerprint.fingerprint for engaging users.
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ cluster: boolean, ratio: number, deviceCount: number, interactionCount: number }>}
 */
async function detectDeviceCluster(contentId, contentType = 'stream') {
  if (contentType !== 'stream') {
    return { cluster: false, ratio: 1, deviceCount: 0, interactionCount: 0 };
  }
  const sid = contentId.toString?.() || contentId;
  const [likes, comments] = await Promise.all([
    db.StreamLike.find({ streamId: sid }).select('userId').lean(),
    db.StreamComment.find({ streamId: sid, deletedAt: null }).select('userId').lean(),
  ]);
  const interactions = [...likes, ...comments];
  const interactionCount = interactions.length;
  if (interactionCount < DEVICE_CLUSTER_MIN_INTERACTIONS) {
    return { cluster: false, ratio: 1, deviceCount: 0, interactionCount };
  }
  const engagerIds = [...new Set(interactions.map((i) => i.userId?.toString()).filter(Boolean))];
  const deviceFingerprints = await db.DeviceFingerprint.distinct('fingerprint', { userId: { $in: engagerIds } });
  const deviceCount = deviceFingerprints.length;
  const ratio = deviceCount / interactionCount;
  const cluster = ratio < DEVICE_CLUSTER_RATIO_THRESHOLD;
  return {
    cluster,
    ratio: Math.round(ratio * 1000) / 1000,
    deviceCount,
    interactionCount,
  };
}

/**
 * Run device-cluster check and flag content if ratio < threshold.
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ cluster: boolean, ratio: number, flagged: boolean }>}
 */
async function checkAndFlagDeviceCluster(contentId, contentType = 'stream') {
  const result = await detectDeviceCluster(contentId, contentType);
  if (result.cluster) {
    await flagContent(contentId, 'device_cluster', {
      ratio: result.ratio,
      deviceCount: result.deviceCount,
      interactionCount: result.interactionCount,
    });
    return { ...result, flagged: true };
  }
  return { ...result, flagged: false };
}

module.exports = {
  getViewTimeline,
  detectVelocitySpike,
  flagContent,
  checkAndFlagVelocity,
  detectDeviceCluster,
  checkAndFlagDeviceCluster,
  SPIKE_RATIO_THRESHOLD,
  DEVICE_CLUSTER_RATIO_THRESHOLD,
};
