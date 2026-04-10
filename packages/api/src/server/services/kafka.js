'use strict';
/**
 * Kafka producer facade — single shared producer via kafkaEventBus (retries, DLQ, env parity).
 *
 * Docker (dev): see docs — `apache/kafka` needs advertised listeners for non-Docker clients.
 * Env: KAFKA_ENABLED=true, KAFKA_BROKERS=localhost:9092
 * https://milloapp.com
 */
const kafkaEventBus = require('../../services/kafkaEventBus');

const TOPICS = kafkaEventBus.TOPICS;

/**
 * Publish JSON event to any topic (connects producer lazily inside kafkaEventBus).
 * @param {string} topic
 * @param {object} message
 * @param {{ key?: string, retries?: number }} [opts]
 */
async function sendEvent(topic, message = {}, opts = {}) {
  if (!topic) {
    throw new Error('TOPIC_REQUIRED');
  }
  const result = await kafkaEventBus.publish(topic, message, opts);
  if (!result.ok && !result.skipped) {
    const err = new Error(result.error || 'KAFKA_SEND_FAILED');
    err.result = result;
    throw err;
  }
  return result;
}

/**
 * Convenience: emit to `video.events` for the feed engine consumer.
 */
async function sendVideoEvent(payload = {}) {
  return sendEvent(TOPICS.VIDEO_EVENTS, { source: 'millo-api', ...payload });
}

/** Trust & Safety — topic `content.moderation` */
async function sendContentModeration(message = {}) {
  return sendEvent(TOPICS.CONTENT_MODERATION, { event: 'content.moderation', source: 'millo-api', ...message });
}

/** Real-time risk updates — topic `risk.update` (event name `risk.update`). */
async function sendRiskUpdate(data = {}) {
  return sendEvent(TOPICS.RISK_UPDATE, { event: 'risk.update', source: 'millo-api', ...data });
}

/** Recommendation pipeline topics — prefer `feedEvents.producer.emitFeedEvent` for strict topic allowlist. */
async function sendFeedPipelineEvent(topic, payload = {}, opts = {}) {
  const { emitFeedEvent } = require('../../services/feedEvents.producer');
  return emitFeedEvent(topic, payload, opts);
}

module.exports = {
  TOPICS,
  sendEvent,
  sendVideoEvent,
  sendContentModeration,
  sendRiskUpdate,
  sendFeedPipelineEvent,
  isEnabled: kafkaEventBus.isEnabled,
  getBrokers: kafkaEventBus.getBrokers,
};
