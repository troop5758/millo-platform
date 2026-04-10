'use strict';
/**
 * Kafka consumer — Feed engine (`video.events`).
 * Group: feed-group (override with KAFKA_FEED_ENGINE_GROUP_ID).
 *
 * Enable: KAFKA_ENABLED=true and KAFKA_FEED_ENGINE_CONSUMER_ENABLED=true
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const TOPICS = kafka.TOPICS;

let _consumer = null;

async function handleEvent(payload) {
  const event = payload || {};
  // eslint-disable-next-line no-console
  console.log('[feed-engine] Processing:', event.type || event.event || 'unknown', event);
  // Extend here: re-rank feed segments, notify subscribers, write to analytics DB, etc.
}

async function start(opts = {}) {
  const log = opts.log || console;
  if (!kafka.isEnabled()) {
    log.info?.('[kafkaFeedEngine] Kafka disabled, skipping');
    return { consumer: null, run: Promise.resolve() };
  }
  if (process.env.KAFKA_FEED_ENGINE_CONSUMER_ENABLED !== 'true') {
    log.info?.('[kafkaFeedEngine] Set KAFKA_FEED_ENGINE_CONSUMER_ENABLED=true to run feed consumer');
    return { consumer: null, run: Promise.resolve() };
  }

  const groupId = process.env.KAFKA_FEED_ENGINE_GROUP_ID || 'feed-group';
  const { consumer, run } = await kafka.startConsumer(
    groupId,
    [TOPICS.VIDEO_EVENTS],
    (payload) => handleEvent(payload),
    { fromBeginning: false, log },
  );
  _consumer = consumer;
  if (run) run.catch((err) => log.error?.({ err }, '[kafkaFeedEngine] consumer run error'));
  log.info?.({ topic: TOPICS.VIDEO_EVENTS, groupId }, '[kafkaFeedEngine] started');
  return { consumer, run };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch {}
    _consumer = null;
  }
}

module.exports = { start, stop, handleEvent };
