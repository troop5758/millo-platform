'use strict';
/**
 * Notifications event consumer — subscribes to notifications topic for event-driven push/email.
 * Handles payloads with userId, type, title, body, etc. Kafka consumer group: millo-notifications-consumer.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const TOPICS = kafka.TOPICS;

let _consumer = null;

async function handleEvent(payload, topic) {
  const { userId, type, title, body, meta = {} } = payload || {};
  if (!userId) return;
  try {
    const { notifyUser } = require('../lib/notifyUser');
    if (notifyUser && typeof notifyUser === 'function') {
      await notifyUser(userId, {
        type: type || 'event_bus',
        title: title ?? 'Notification',
        body: body ?? '',
        meta: typeof meta === 'object' ? meta : {},
      });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[notificationsEventConsumer] notifyUser failed:', err?.message);
    }
  }
}

async function start(opts = {}) {
  if (!kafka.isEnabled()) {
    opts.log?.info?.('[notificationsEventConsumer] Event bus disabled, skipping');
    return { consumer: null };
  }
  const groupId = process.env.KAFKA_NOTIFICATIONS_CONSUMER_GROUP_ID || 'millo-notifications-consumer';
  const topics = [TOPICS.NOTIFICATIONS];
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
