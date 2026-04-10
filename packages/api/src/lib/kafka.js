'use strict';
/**
 * Kafka entrypoint — real-time backbone (analytics, moderation, event sourcing).
 * Delegates to {@link ../services/kafkaEventBus} so one producer, retries, and optional DLQ apply.
 *
 * Env: `KAFKA_ENABLED=true`, `KAFKA_BROKERS` or `KAFKA_BROKER` (comma-separated), `KAFKA_CLIENT_ID`
 *
 * @example
 * const { sendEvent, TOPICS } = require('./lib/kafka');
 * await sendEvent('live-events', { type: 'STREAM_STARTED', userId, roomId, timestamp: Date.now() });
 *
 * @example Product events (`events/track.js`)
 * const { trackEvent } = require('../events/track');
 * await trackEvent({ type: 'WATCH_TIME', userId, videoId, duration: 12.5 });
 *
 * @example
 * const { startModerationConsumer } = require('./lib/kafka');
 * await startModerationConsumer(async (data) => {
 *   if (data.type === 'STREAM_STARTED') { /* moderation pipeline *\/ }
 * });
 * https://milloapp.com
 */

const kafkaEventBus = require('../services/kafkaEventBus');

/** Re-export canonical topic names (snake_case in Millo). */
const TOPICS = kafkaEventBus.TOPICS;

/** Hyphenated alias for docs / external producers publishing to `live-events`. */
const LEGACY_TOPICS = Object.freeze({
  LIVE_EVENTS: 'live-events',
});

/**
 * Publish a JSON event (adds `ts`, retries, DLQ via event bus).
 * @param {string} topic
 * @param {Record<string, unknown>} message
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, attempts?: number }>}
 */
async function sendEvent(topic, message) {
  const body = message && typeof message === 'object' && !Array.isArray(message) ? message : {};
  return kafkaEventBus.publish(topic, body);
}

/**
 * kafkajs-like producer shim over the shared Millo producer (no second TCP connection).
 */
const producer = {
  async connect() {
    if (!kafkaEventBus.isEnabled()) return;
    await kafkaEventBus.healthCheck();
  },
  async disconnect() {
    await kafkaEventBus.close();
  },
  /**
   * @param {{ topic: string, messages: Array<{ value?: string | Buffer, key?: string }> }} record
   */
  async send(record) {
    const topic = record?.topic;
    if (!topic) throw new Error('producer.send: topic is required');
    const messages = record.messages || [];
    for (const m of messages) {
      let payload = {};
      if (m.value != null) {
        const raw = Buffer.isBuffer(m.value) ? m.value.toString('utf8') : String(m.value);
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = { _raw: raw };
        }
      }
      await kafkaEventBus.publish(topic, payload, { key: m.key || undefined });
    }
  },
};

/**
 * Subscribe to topic(s) and run a handler per message (JSON body).
 * @param {string} groupId
 * @param {string | string[]} topicOrTopics
 * @param {(data: Record<string, unknown>, topic: string) => Promise<void>} eachMessage
 * @param {{ fromBeginning?: boolean, log?: object }} [opts]
 */
async function runConsumer(groupId, topicOrTopics, eachMessage, opts = {}) {
  const topics = Array.isArray(topicOrTopics) ? topicOrTopics : [topicOrTopics];
  return kafkaEventBus.startConsumer(groupId, topics, eachMessage, opts);
}

/**
 * Moderation / AI style consumer: defaults to `live-events` and `moderation-group`.
 * @param {(data: Record<string, unknown>) => Promise<void>} handler
 * @param {{ groupId?: string, topic?: string, fromBeginning?: boolean, log?: object }} [opts]
 */
async function startModerationConsumer(handler, opts = {}) {
  const groupId = opts.groupId || process.env.KAFKA_MODERATION_GROUP_ID || 'moderation-group';
  const topic = opts.topic || LEGACY_TOPICS.LIVE_EVENTS;
  if (typeof handler !== 'function') {
    return { consumer: null, run: Promise.resolve() };
  }
  return kafkaEventBus.startConsumer(
    groupId,
    [topic],
    async (data) => {
      await handler(data);
    },
    { fromBeginning: opts.fromBeginning, log: opts.log },
  );
}

module.exports = {
  TOPICS,
  LEGACY_TOPICS,
  sendEvent,
  producer,
  runConsumer,
  startModerationConsumer,
  isEnabled: kafkaEventBus.isEnabled,
  getBrokers: kafkaEventBus.getBrokers,
};
