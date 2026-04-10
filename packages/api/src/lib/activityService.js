'use strict';
/**
 * Activity service — log profile activity (follow, video_upload, purchase, gift_sent, live_started, content_*).
 * Fire-and-forget; does not block main flow. https://milloapp.com
 */
const db = require('@millo/database');
const kafka = require('../services/kafkaEventBus');

const VALID_TYPES = ['follow', 'video_upload', 'purchase', 'gift_sent', 'live_started', 'content_view', 'content_share'];

/**
 * @param {ObjectId|string} userId - User whose profile gets the activity
 * @param {string} type - follow | video_upload | purchase | gift_sent | live_started | content_view | content_share
 * @param {ObjectId|string} [referenceId] - Related resource (e.g. streamId, orderId)
 */
async function logActivity(userId, type, referenceId = null) {
  if (!userId || !type || !VALID_TYPES.includes(type)) return;
  db.Activity.create({ userId, type, referenceId: referenceId || undefined }).catch(() => {});
  const payload = {
    event: 'activity.logged',
    userId: String(userId),
    activityType: type,
    referenceId: referenceId ? String(referenceId) : null,
  };
  kafka.publish(kafka.TOPICS.ANALYTICS, payload).catch(() => {});
  kafka.publish(kafka.TOPICS.USER_ACTIVITY, payload).catch(() => {});
}

module.exports = { logActivity };
