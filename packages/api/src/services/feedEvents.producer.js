'use strict';
/**
 * Feed / ranking / feature pipeline — produce to recommendation Kafka topics.
 * Uses shared kafkaEventBus (retries, ts envelope, optional DLQ).
 *
 * Env: KAFKA_ENABLED=true, KAFKA_BROKERS=...
 * https://milloapp.com
 */
const kafkaEventBus = require('./kafkaEventBus');

/** Topics allowed by emitFeedEvent (discovery pipeline contract). */
const FEED_PIPELINE_TOPIC_NAMES = Object.freeze([
  kafkaEventBus.TOPICS.FEED_IMPRESSION,
  kafkaEventBus.TOPICS.FEED_WATCH,
  kafkaEventBus.TOPICS.FEED_ENGAGEMENT,
  kafkaEventBus.TOPICS.FEED_NEGATIVE,
  kafkaEventBus.TOPICS.FEATURE_USER_UPDATES,
  kafkaEventBus.TOPICS.FEATURE_CONTENT_UPDATES,
  kafkaEventBus.TOPICS.RANK_TRAIN_SAMPLES,
  kafkaEventBus.TOPICS.RANK_PREDICTIONS,
  kafkaEventBus.TOPICS.CREATOR_TRUST_UPDATES,
  kafkaEventBus.TOPICS.CONTENT_MODERATION_UPDATES,
]);

const _allowedTopics = new Set(FEED_PIPELINE_TOPIC_NAMES);

/**
 * Publish JSON payload to a pipeline topic (validates topic name).
 * @param {string} topic - One of FEED_PIPELINE_TOPIC_NAMES / kafkaEventBus.TOPICS.* above
 * @param {object} [payload]
 * @param {{ key?: string, retries?: number }} [opts] - passed to kafkaEventBus.publish
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, attempts?: number, error?: string }>}
 */
async function emitFeedEvent(topic, payload = {}, opts = {}) {
  if (!topic || typeof topic !== 'string') {
    const err = new Error('TOPIC_REQUIRED');
    err.code = 'TOPIC_REQUIRED';
    throw err;
  }
  if (!_allowedTopics.has(topic)) {
    const err = new Error('INVALID_FEED_PIPELINE_TOPIC');
    err.code = 'INVALID_FEED_PIPELINE_TOPIC';
    err.topic = topic;
    throw err;
  }
  return kafkaEventBus.publish(topic, { source: 'feed-pipeline', ...payload }, opts);
}

module.exports = {
  emitFeedEvent,
  FEED_PIPELINE_TOPIC_NAMES,
};
