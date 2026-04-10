'use strict';
/**
 * Unified event bus — Kafka or RabbitMQ. Single API: produce(topic, payload).
 * Topics: payments, live_events, moderation, notifications, analytics, fraud.
 * https://milloapp.com
 */
const TOPICS = Object.freeze({
  PAYMENTS: 'payments',
  LIVE_EVENTS: 'live_events',
  LIVE_EVENTS_ALT: 'live-events',
  MODERATION: 'moderation',
  MODERATION_EVENTS: 'moderation_events',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  FRAUD: 'fraud',
  USER_ACTIVITY: 'user_activity',
  USER_EVENTS: 'user_events',
  AUTH_EVENTS: 'auth_events',
});

function useRabbitMQ() {
  return process.env.EVENT_BUS === 'rabbitmq' && process.env.RABBITMQ_URL;
}

function useKafka() {
  return process.env.KAFKA_ENABLED === 'true' || (!useRabbitMQ() && process.env.KAFKA_BROKERS);
}

function getBackend() {
  if (useRabbitMQ()) return require('./rabbitmqEventBus');
  return require('./kafkaEventBus');
}

/**
 * Produce event to topic. Alias: publish.
 * Example: eventBus.produce('payments', { type: 'coin_purchase', userId })
 */
async function produce(topic, payload = {}) {
  const backend = getBackend();
  if (topic === TOPICS.LIVE_EVENTS_ALT) topic = TOPICS.LIVE_EVENTS;
  return backend.publish(topic, payload);
}

async function publish(topic, payload = {}) {
  return produce(topic, payload);
}

function isEnabled() {
  return useRabbitMQ() ? require('./rabbitmqEventBus').isEnabled() : require('./kafkaEventBus').isEnabled();
}

async function close() {
  if (useRabbitMQ()) return require('./rabbitmqEventBus').close();
  return require('./kafkaEventBus').close();
}

module.exports = {
  TOPICS,
  produce,
  publish,
  isEnabled,
  close,
  getBackend,
  useKafka,
  useRabbitMQ,
};
