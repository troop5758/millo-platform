'use strict';
/**
 * Feature extraction for ML — view velocity, device cluster, trust score, engagement ratio.
 * Used by featureGenerator worker to build feature vectors for training.
 * https://milloapp.com
 */
const db = require('@millo/database');
const trustScoreEngine = require('./trustScoreEngine');
const botGraphDetection = require('./botGraphDetection');
const engagementVelocityService = require('./engagementVelocityService');
const engagementAuthenticityService = require('./engagementAuthenticityService');

/**
 * Views per minute (last minute) for content. Streams: LiveViewer count in last minute.
 */
async function getViewVelocity(contentId, contentType = 'stream') {
  if (!contentId) return 0;
  const timeline = await engagementVelocityService.getViewTimeline(contentId, contentType);
  return timeline?.lastMinute ?? 0;
}

/**
 * Number of accounts sharing a device with this user (device cluster size).
 */
async function getDeviceClusterSize(userId) {
  if (!userId) return 0;
  const cluster = await botGraphDetection.getClusterByDevice(userId);
  return cluster?.length ?? 0;
}

/**
 * User trust score (0–100).
 */
async function getTrustScore(userId) {
  if (!userId) return 0;
  const { score } = await trustScoreEngine.getTrustScore(userId).catch(() => ({ score: 0 }));
  return score ?? 0;
}

/**
 * Engagement ratio for content: uniqueUsersInteracting / totalInteractions (0–1).
 * Stream: from getStreamEngagementMetrics.
 */
async function getEngagementRatio(contentId, contentType = 'stream') {
  if (!contentId) return 0;
  if (contentType === 'stream') {
    const metrics = await engagementAuthenticityService.getStreamEngagementMetrics(contentId);
    return metrics?.engagementQuality ?? metrics?.authenticity ?? 0;
  }
  return 0;
}

module.exports = {
  getViewVelocity,
  getDeviceClusterSize,
  getTrustScore,
  getEngagementRatio,
};
