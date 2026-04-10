'use strict';
/**
 * Feature Generator Worker — builds ML feature vectors from events and stores for training.
 * generateFeatures(event) → { viewVelocity, deviceCluster, trustScore, engagementRatio } stored in MlFeatureSnapshot.
 * https://milloapp.com
 */
const db = require('@millo/database');
const featureGeneratorService = require('../services/featureGeneratorService');

/**
 * Generate feature vector for an event. Event should have userId, contentId, and optionally eventType.
 * @param {object} event - { userId?, contentId?, content type?, eventType? }
 * @returns {Promise<object>} features - { viewVelocity, deviceCluster, trustScore, engagementRatio }
 */
async function generateFeatures(event) {
  const userId = event?.userId ?? event?.user_id ?? null;
  const contentId = event?.contentId ?? event?.content_id ?? event?.streamId ?? event?.stream_id ?? null;
  const contentType = event?.contentType ?? event?.content_type ?? 'stream';
  const eventType = event?.eventType ?? event?.event_type ?? event?.type ?? 'unknown';

  const [viewVelocity, deviceCluster, trustScore, engagementRatio] = await Promise.all([
    contentId ? featureGeneratorService.getViewVelocity(contentId, contentType) : Promise.resolve(0),
    userId ? featureGeneratorService.getDeviceClusterSize(userId) : Promise.resolve(0),
    userId ? featureGeneratorService.getTrustScore(userId) : Promise.resolve(0),
    contentId ? featureGeneratorService.getEngagementRatio(contentId, contentType) : Promise.resolve(0),
  ]);

  const features = {
    viewVelocity,
    deviceCluster,
    trustScore,
    engagementRatio,
  };
  return features;
}

/**
 * Generate features and persist to MlFeatureSnapshot for ML training.
 * @param {object} event - event payload with userId, contentId, etc.
 * @returns {Promise<{ features: object, snapshotId?: object }>}
 */
async function generateAndStoreFeatures(event) {
  const features = await generateFeatures(event);
  const userId = event?.userId ?? event?.user_id ?? null;
  const contentId = event?.contentId ?? event?.content_id ?? event?.streamId ?? event?.stream_id ?? null;
  const eventType = event?.eventType ?? event?.event_type ?? event?.type ?? 'unknown';

  const snapshot = await db.MlFeatureSnapshot.create({
    userId: userId ? String(userId) : undefined,
    contentId: contentId ? String(contentId) : undefined,
    eventType,
    features,
  }).catch(() => null);

  return { features, snapshotId: snapshot?._id };
}

module.exports = {
  generateFeatures,
  generateAndStoreFeatures,
};
