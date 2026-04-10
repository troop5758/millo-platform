'use strict';
/**
 * RabbitMQ event bus — alternative to Kafka when EVENT_BUS=rabbitmq.
 * Same topics: payments, live_events, moderation, notifications, analytics, fraud.
 * Uses a single topic exchange; routing key = topic name.
 * https://milloapp.com
 */
const TOPICS = Object.freeze({
  PAYMENTS: 'payments',
  LIVE_EVENTS: 'live_events',
  MODERATION: 'moderation',
  MODERATION_EVENTS: 'moderation_events',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  FRAUD: 'fraud',
  USER_ACTIVITY: 'user_activity',
  USER_EVENTS: 'user_events',
  AUTH_EVENTS: 'auth_events',
});

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'millo_events';
let _channel = null;
let _conn = null;
let _connecting = null;

function isEnabled() {
  return process.env.EVENT_BUS === 'rabbitmq' && !!process.env.RABBITMQ_URL;
}

async function getChannel() {
  if (_channel) return _channel;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    try {
      let amqp;
      try {
        amqp = require('amqplib');
      } catch {
        if (process.env.NODE_ENV !== 'production') console.warn('[rabbitmq] amqplib not installed');
        return null;
      }
      const url = process.env.RABBITMQ_URL || 'amqp://localhost';
      _conn = await amqp.connect(url);
      _channel = await _conn.createChannel();
      await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      return _channel;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[rabbitmq] connect failed:', err?.message);
      return null;
    } finally {
      _connecting = null;
    }
  })();
  return _connecting;
}

async function publish(topic, event = {}) {
  if (!topic) return { ok: false, skipped: true, reason: 'TOPIC_REQUIRED' };
  const ch = await getChannel();
  if (!ch) return { ok: false, skipped: true, reason: 'RABBITMQ_DISABLED_OR_MISSING' };
  try {
    const payload = { ts: new Date().toISOString(), ...event };
    const ok = ch.publish(EXCHANGE, topic, Buffer.from(JSON.stringify(payload)), { persistent: true });
    return { ok: !!ok };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[rabbitmq] publish failed:', err?.message);
    return { ok: false, error: err?.message || 'PUBLISH_FAILED' };
  }
}

async function close() {
  try {
    if (_channel) await _channel.close();
    if (_conn) await _conn.close();
  } catch {}
  _channel = null;
  _conn = null;
}

module.exports = { TOPICS, publish, close, isEnabled, getChannel, EXCHANGE };
