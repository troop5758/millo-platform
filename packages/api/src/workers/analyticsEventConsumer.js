'use strict';
/**
 * Analytics event consumer — subscribes to analytics, payments, live_events for event-driven analytics.
 * Persists or aggregates events (e.g. PlatformMetric, activity counts). Kafka consumer group: millo-analytics-consumer.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const TOPICS = kafka.TOPICS;

let _consumer = null;

async function handleEvent(payload, topic) {
  const { type, userId, ...rest } = payload || {};
  if (!type && !userId && Object.keys(rest || {}).length === 0) return;
  const db = require('@millo/database');
  if (db.EventBusLog) {
    await db.EventBusLog.create({
      topic,
      eventType: type || 'unknown',
      userId: userId || null,
      meta: { ...rest },
    }).catch(() => {});
  }
}

async function start(opts = {}) {
  if (!kafka.isEnabled()) {
    opts.log?.info?.('[analyticsEventConsumer] Event bus disabled, skipping');
    return { consumer: null };
  }
  const groupId = process.env.KAFKA_ANALYTICS_CONSUMER_GROUP_ID || 'millo-analytics-consumer';
  const topics = [TOPICS.ANALYTICS, TOPICS.PAYMENTS, TOPICS.LIVE_EVENTS];
  const { consumer, run } = await kafka.startConsumer(groupId, topics, handleEvent, {
    fromBeginning: false,
    log: opts.log || console,
  });
  _consumer = consumer;
  if (run) run.catch(() => {});
  return { consumer };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch {}
    _consumer = null;
  }
}

module.exports = { start, stop };
