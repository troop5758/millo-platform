'use strict';
/**
 * Data collection foundation — interaction events for downstream feature pipelines.
 * Publishes to Kafka `user_events` ({@link ../services/kafkaEventBus.js} `TOPICS.USER_EVENTS`).
 *
 * Not the same as `server/services/analytics.js` `trackEvent` (Mixpanel / Amplitude).
 *
 * Events you MUST instrument for discovery / ranking foundations:
 * WATCH_START, WATCH_END, WATCH_TIME, LIKE, COMMENT, SHARE, FOLLOW, SKIP
 *
 * Downstream: `packages/workers/features.worker.js` aggregates `user_events` (enable `FEATURES_KAFKA_WORKER=true`).
 *
 * When `KAFKA_ENABLED` is off, {@link ../lib/kafka.js} `sendEvent` returns `{ ok: false, skipped: true }`.
 * https://milloapp.com
 */

const { sendEvent, TOPICS } = require('../lib/kafka');

/** @readonly Standard event `type` strings for contracts and consumers. */
const TRACK_EVENT_TYPES = Object.freeze({
  WATCH_START: 'WATCH_START',
  WATCH_END: 'WATCH_END',
  WATCH_TIME: 'WATCH_TIME',
  LIKE: 'LIKE',
  COMMENT: 'COMMENT',
  SHARE: 'SHARE',
  FOLLOW: 'FOLLOW',
  SKIP: 'SKIP',
});

/**
 * @param {object} event
 * @param {string} event.type — use {@link TRACK_EVENT_TYPES} values (required)
 * @param {string} [event.userId]
 * @param {string} [event.videoId]
 * @param {string} [event.contentId]
 * @param {number} [event.duration] — e.g. seconds for WATCH_TIME
 * @param {number} [event.timestamp] — ms epoch; default `Date.now()`
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, attempts?: number }>}
 */
async function trackEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('trackEvent: event object required');
  }
  if (event.type == null || String(event.type).trim() === '') {
    throw new TypeError('trackEvent: type is required');
  }
  const payload = {
    source: 'millo-api',
    ...event,
    type: String(event.type),
    timestamp: event.timestamp != null ? Number(event.timestamp) : Date.now(),
  };
  return sendEvent(TOPICS.USER_EVENTS, payload);
}

module.exports = {
  trackEvent,
  TRACK_EVENT_TYPES,
};
