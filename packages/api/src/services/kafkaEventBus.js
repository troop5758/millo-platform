'use strict';
/**
 * Kafka event bus (Phase 7): payments, live_events, moderation, notifications, analytics.
 * Phase 3: abuse detection pipeline — consumer API for user_activity, auth_events, payments, live_events, moderation_events.
 * Features: retry logic, dead letter queues, consumer orchestration.
 * Usage: await kafka.publish('live_events', event)
 * https://milloapp.com
 */

const TOPICS = Object.freeze({
  PAYMENTS: 'payments',
  LIVE_EVENTS: 'live_events',
  MODERATION: 'moderation',
  MODERATION_EVENTS: 'moderation_events',
  /** Trust & Safety — AI / multimodal moderation outcomes (Phase 3). */
  CONTENT_MODERATION: 'content.moderation',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  FRAUD: 'fraud',
  USER_ACTIVITY: 'user_activity',
  /** Product / ML foundation — watch, engagement, skip, etc. (see packages/api/src/events/track.js). */
  USER_EVENTS: 'user_events',
  AUTH_EVENTS: 'auth_events',
  /** VOD / upload pipeline: API publishes after source file is available; worker transcodes and publishes VIDEO_READY. */
  VIDEO_UPLOADED: 'video.uploaded',
  VIDEO_READY: 'video.ready',
  /** Feed / discovery engine — aggregate video lifecycle signals (ingest, transcode, publish). */
  VIDEO_EVENTS: 'video.events',
  /** Kafka-driven discovery ranking (consumer updates Redis). */
  VIDEO_VIEW: 'video.view',
  VIDEO_LIKE: 'video.like',
  /** Live chat text for Kafka moderation worker → moderation-results → enforcement consumer. */
  CHAT_MESSAGES: 'chat-messages',
  /** AI/rule moderation outcomes (worker producer); API enforcement consumer applies actions. */
  MODERATION_RESULTS: 'moderation-results',
  /** Realtime gifts: API/socket after wallet settlement; gift worker consumes for audit + fraud enrichment. */
  GIFT_SENT: 'gift.sent',
  /** Real-time risk — WebSocket `suspicious-activity` → `risk.update` envelope for fraud / dashboards. */
  RISK_UPDATE: 'risk.update',
  /** Feed pipeline — impressions, watch milestones, engagement, negative signals (training / bandits). */
  FEED_IMPRESSION: 'feed.impression',
  FEED_WATCH: 'feed.watch',
  FEED_ENGAGEMENT: 'feed.engagement',
  FEED_NEGATIVE: 'feed.negative',
  /** Feature store / batch jobs — user & content feature row updates. */
  FEATURE_USER_UPDATES: 'feature.user.updates',
  FEATURE_CONTENT_UPDATES: 'feature.content.updates',
  /** Ranking — training samples, online prediction logs (shadow / prod). */
  RANK_TRAIN_SAMPLES: 'rank.train.samples',
  RANK_PREDICTIONS: 'rank.predictions',
  /** Trust & moderation sidecars for discovery filters. */
  CREATOR_TRUST_UPDATES: 'creator.trust.updates',
  CONTENT_MODERATION_UPDATES: 'content.moderation.updates',
  // Dead letter queues
  DLQ_PAYMENTS: 'payments.dlq',
  DLQ_MODERATION: 'moderation.dlq',
  DLQ_FRAUD: 'fraud.dlq',
});

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: parseInt(process.env.KAFKA_MAX_RETRIES, 10) || 3,
  retryDelayMs: parseInt(process.env.KAFKA_RETRY_DELAY_MS, 10) || 1000,
  enableDLQ: process.env.KAFKA_ENABLE_DLQ !== 'false',
};

let _producer = null;
let _connecting = null;
let _kafkaInstance = null;
let _admin = null;

/** Abuse consumer: topic -> handler(s). Handlers run in order. */
const _abuseHandlers = new Map();

function isEnabled() {
  return process.env.KAFKA_ENABLED === 'true';
}

function getBrokers() {
  const raw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'localhost:9092';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function getProducer() {
  if (!isEnabled()) return null;
  if (_producer) return _producer;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    let Kafka;
    try {
      ({ Kafka } = require('kafkajs'));
    } catch {
      return null;
    }

    const kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'millo-api',
      brokers: getBrokers(),
    });
    _kafkaInstance = kafka;
    const producer = kafka.producer({
      allowAutoTopicCreation: true,
    });
    await producer.connect();
    _producer = producer;
    return _producer;
  })().finally(() => {
    _connecting = null;
  });

  return _connecting;
}

function getKafkaInstance() {
  return _kafkaInstance;
}

/**
 * Register a handler for an abuse topic. Call before startAbuseConsumer.
 * @param {string} topic - Topic name (e.g. TOPICS.USER_ACTIVITY, 'payments')
 * @param {(event: object) => Promise<void>} handler
 */
function addAbuseHandler(topic, handler) {
  if (!topic || typeof handler !== 'function') return;
  const list = _abuseHandlers.get(topic) || [];
  list.push(handler);
  _abuseHandlers.set(topic, list);
}

/**
 * Start abuse consumer. Subscribes to all topics with registered handlers.
 * @param {string} [groupId] - Consumer group id (default: millo-abuse-consumer)
 * @param {{ fromBeginning?: boolean, log?: object }} [opts]
 * @returns {Promise<{ consumer: object, run: Promise<never> }>} - run never resolves (long-running)
 */
async function startAbuseConsumer(groupId, opts = {}) {
  if (!isEnabled()) return { consumer: null, run: Promise.resolve() };
  const id = groupId || process.env.KAFKA_ABUSE_CONSUMER_GROUP_ID || 'millo-abuse-consumer';
  const fromBeginning = opts.fromBeginning === true;
  const log = opts.log || console;

  let Kafka;
  try {
    ({ Kafka } = require('kafkajs'));
  } catch (err) {
    log.warn?.('[kafka] kafkajs not installed, abuse consumer disabled');
    return { consumer: null, run: Promise.resolve() };
  }

  const brokers = getBrokers();
  if (!brokers.length) {
    log.warn?.('[kafka] no brokers, abuse consumer disabled');
    return { consumer: null, run: Promise.resolve() };
  }

  const kafka = new Kafka({
    clientId: (process.env.KAFKA_CLIENT_ID || 'millo-api') + '-abuse',
    brokers,
  });
  const consumer = kafka.consumer({ groupId: id });
  await consumer.connect();

  const topics = [..._abuseHandlers.keys()];
  if (topics.length === 0) {
    log.warn?.('[kafka] no abuse handlers registered');
    await consumer.disconnect();
    return { consumer: null, run: Promise.resolve() };
  }

  await Promise.all(
    topics.map((topic) =>
      consumer.subscribe({ topic, fromBeginning })
    )
  );

  const run = consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const handlers = _abuseHandlers.get(topic);
      if (!handlers?.length) return;
      let payload;
      try {
        payload = message.value ? JSON.parse(message.value.toString()) : {};
      } catch {
        return;
      }
      for (const fn of handlers) {
        try {
          await fn(payload);
        } catch (err) {
          log.error?.({ err, topic, partition }, '[kafka] abuse handler error');
        }
      }
    },
  });

  log.info?.({ topics }, '[kafka] abuse consumer started');
  return { consumer, run };
}

/**
 * Produce event to topic. Alias for publish.
 * Example: kafka.produce('payments', { type: 'coin_purchase', userId })
 */
async function produce(topic, event = {}) {
  return publish(topic, event);
}

/**
 * Publish event to Kafka topic with retry logic.
 * @param {string} topic
 * @param {object} event
 * @param {{ retries?: number, key?: string }} [opts]
 */
async function publish(topic, event = {}, opts = {}) {
  if (!topic) return { ok: false, skipped: true, reason: 'TOPIC_REQUIRED' };
  const producer = await getProducer();
  if (!producer) return { ok: false, skipped: true, reason: 'KAFKA_DISABLED_OR_MISSING' };

  const maxRetries = opts.retries ?? RETRY_CONFIG.maxRetries;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const payload = {
        ts: new Date().toISOString(),
        _attempt: attempt > 0 ? attempt : undefined,
        ...event,
      };

      await producer.send({
        topic,
        messages: [{
          key: opts.key || event.userId || event.id || null,
          value: JSON.stringify(payload),
          headers: {
            'x-source': 'millo-api',
            'x-attempt': String(attempt),
          },
        }],
      });

      return { ok: true, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(RETRY_CONFIG.retryDelayMs * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  // All retries failed — send to DLQ if enabled
  if (RETRY_CONFIG.enableDLQ && !topic.endsWith('.dlq')) {
    const dlqTopic = `${topic}.dlq`;
    try {
      await producer.send({
        topic: dlqTopic,
        messages: [{
          value: JSON.stringify({
            originalTopic: topic,
            event,
            error: lastError?.message,
            failedAt: new Date().toISOString(),
            attempts: maxRetries + 1,
          }),
        }],
      });
    } catch (dlqErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[kafka] DLQ publish failed:', dlqErr?.message);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[kafka] publish failed after retries:', lastError?.message);
  }
  return { ok: false, error: lastError?.message || 'PUBLISH_FAILED', attempts: maxRetries + 1 };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function close() {
  if (!_producer) return;
  try {
    await _producer.disconnect();
  } catch {}
  _producer = null;
}

/**
 * Start a generic consumer for given topics and handler. Use for analytics, notifications, etc.
 * @param {string} groupId - Consumer group id (e.g. millo-analytics-consumer)
 * @param {string[]} topics - Topic names
 * @param {(payload: object, topic: string) => Promise<void>} handler
 * @param {{ fromBeginning?: boolean, log?: object }} [opts]
 */
async function startConsumer(groupId, topics, handler, opts = {}) {
  if (!isEnabled() || !topics?.length || typeof handler !== 'function') {
    return { consumer: null, run: Promise.resolve() };
  }
  let Kafka;
  try {
    ({ Kafka } = require('kafkajs'));
  } catch {
    return { consumer: null, run: Promise.resolve() };
  }
  const brokers = getBrokers();
  if (!brokers.length) return { consumer: null, run: Promise.resolve() };
  const log = opts.log || console;
  const kafka = new Kafka({
    clientId: (process.env.KAFKA_CLIENT_ID || 'millo-api') + '-' + (groupId || 'consumer').replace(/[^a-z0-9-]/gi, '-'),
    brokers,
  });
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await Promise.all(topics.map((t) => consumer.subscribe({ topic: t, fromBeginning: opts.fromBeginning === true })));
  const run = consumer.run({
    eachMessage: async ({ topic, message }) => {
      let payload = {};
      try {
        if (message.value) payload = JSON.parse(message.value.toString());
      } catch {}
      try {
        await handler(payload, topic);
      } catch (err) {
        log.error?.({ err, topic }, '[kafka] consumer handler error');
      }
    },
  });
  log.info?.({ groupId, topics }, '[kafka] consumer started');
  return { consumer, run };
}

/**
 * Ensure all topics exist. Call during app startup.
 */
async function ensureTopics() {
  if (!isEnabled()) return { ok: false, reason: 'KAFKA_DISABLED' };

  let Kafka;
  try {
    ({ Kafka } = require('kafkajs'));
  } catch {
    return { ok: false, reason: 'KAFKAJS_NOT_INSTALLED' };
  }

  const brokers = getBrokers();
  if (!brokers.length) return { ok: false, reason: 'NO_BROKERS' };

  try {
    const kafka = new Kafka({
      clientId: (process.env.KAFKA_CLIENT_ID || 'millo-api') + '-admin',
      brokers,
    });
    _admin = kafka.admin();
    await _admin.connect();

    const existingTopics = await _admin.listTopics();
    const allTopics = Object.values(TOPICS);
    const missingTopics = allTopics.filter((t) => !existingTopics.includes(t));

    if (missingTopics.length > 0) {
      await _admin.createTopics({
        topics: missingTopics.map((topic) => ({
          topic,
          numPartitions: parseInt(process.env.KAFKA_PARTITIONS, 10) || 3,
          replicationFactor: parseInt(process.env.KAFKA_REPLICATION_FACTOR, 10) || 1,
        })),
      });
      console.info('[kafka] Created topics:', missingTopics);
    }

    await _admin.disconnect();
    _admin = null;
    return { ok: true, created: missingTopics };
  } catch (err) {
    console.warn('[kafka] ensureTopics failed:', err?.message);
    return { ok: false, error: err?.message };
  }
}

/**
 * Health check for Kafka connection.
 */
async function healthCheck() {
  if (!isEnabled()) {
    return { healthy: true, reason: 'KAFKA_DISABLED' };
  }

  try {
    const producer = await getProducer();
    if (!producer) {
      return { healthy: false, reason: 'PRODUCER_NOT_CONNECTED' };
    }

    // Try to fetch metadata as a health check
    const kafka = getKafkaInstance();
    if (!kafka) {
      return { healthy: false, reason: 'KAFKA_NOT_INITIALIZED' };
    }

    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    await admin.disconnect();

    return {
      healthy: true,
      brokers: getBrokers(),
      topicCount: topics.length,
    };
  } catch (err) {
    return { healthy: false, error: err?.message };
  }
}

/**
 * Publish batch of events to a topic.
 */
async function publishBatch(topic, events = []) {
  if (!topic || !events.length) return { ok: false, reason: 'TOPIC_OR_EVENTS_REQUIRED' };
  const producer = await getProducer();
  if (!producer) return { ok: false, skipped: true, reason: 'KAFKA_DISABLED_OR_MISSING' };

  try {
    const messages = events.map((event) => ({
      key: event.userId || event.id || null,
      value: JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      }),
    }));

    await producer.send({ topic, messages });
    return { ok: true, count: events.length };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[kafka] batch publish failed:', err?.message);
    }
    return { ok: false, error: err?.message };
  }
}

module.exports = {
  TOPICS,
  RETRY_CONFIG,
  publish,
  publishBatch,
  produce,
  close,
  isEnabled,
  getBrokers,
  getKafkaInstance,
  addAbuseHandler,
  startAbuseConsumer,
  startConsumer,
  ensureTopics,
  healthCheck,
};

