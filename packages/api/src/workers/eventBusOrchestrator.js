'use strict';
/**
 * Event bus consumer orchestrator — starts/stops all Kafka/RabbitMQ consumers.
 * Manages: analytics, notifications, moderation, fraud, abuse detection.
 * https://milloapp.com
 */

const eventBus = require('../services/eventBus');
const kafka = require('../services/kafkaEventBus');

// Consumer modules
const analyticsConsumer = require('./analyticsEventConsumer');
const notificationsConsumer = require('./notificationsEventConsumer');
const moderationConsumer = require('./moderationEventConsumer');
const fraudConsumer = require('./fraudEventConsumer');
const abuseConsumer = require('./kafkaAbuseConsumer');
const ffmpegConsumer = require('./ffmpeg.worker');
const kafkaFeedEngineConsumer = require('./kafkaFeedEngine.worker');
const discoveryKafkaRankingConsumer = require('./discoveryKafkaRanking.worker');
const giftKafkaConsumer = require('./giftKafka.worker');
const rankTrainingSampleConsumer = require('./rankTrainingSample.worker');
const moderationResultsEnforcementConsumer = require('./moderationResultsEnforcementConsumer');

const consumers = {
  analytics: analyticsConsumer,
  notifications: notificationsConsumer,
  moderation: moderationConsumer,
  fraud: fraudConsumer,
  abuse: abuseConsumer,
  ffmpeg: ffmpegConsumer,
  feedEngine: kafkaFeedEngineConsumer,
  discoveryRanking: discoveryKafkaRankingConsumer,
  giftKafka: giftKafkaConsumer,
  rankTrainingSample: rankTrainingSampleConsumer,
  moderationResults: moderationResultsEnforcementConsumer,
};

const _running = new Map();

/**
 * Get event bus status and configuration.
 */
function getStatus() {
  const backend = eventBus.useKafka() ? 'kafka' : eventBus.useRabbitMQ() ? 'rabbitmq' : 'none';
  return {
    enabled: eventBus.isEnabled(),
    backend,
    brokers: backend === 'kafka' ? kafka.getBrokers() : [],
    topics: Object.values(kafka.TOPICS),
    consumers: Object.keys(consumers).map((name) => ({
      name,
      running: _running.has(name),
    })),
  };
}

/**
 * Start a specific consumer by name.
 */
async function startConsumer(name, opts = {}) {
  const consumer = consumers[name];
  if (!consumer) {
    throw new Error(`Unknown consumer: ${name}`);
  }

  if (_running.has(name)) {
    opts.log?.info?.({ name }, '[orchestrator] Consumer already running');
    return { started: false, alreadyRunning: true };
  }

  try {
    const result = await consumer.start(opts);
    if (result.consumer) {
      _running.set(name, result.consumer);
      opts.log?.info?.({ name }, '[orchestrator] Consumer started');
      return { started: true };
    }
    return { started: false, reason: 'disabled_or_failed' };
  } catch (err) {
    opts.log?.error?.({ err, name }, '[orchestrator] Consumer start failed');
    throw err;
  }
}

/**
 * Stop a specific consumer by name.
 */
async function stopConsumer(name, opts = {}) {
  const consumer = consumers[name];
  if (!consumer) {
    throw new Error(`Unknown consumer: ${name}`);
  }

  if (!_running.has(name)) {
    return { stopped: false, notRunning: true };
  }

  try {
    await consumer.stop();
    _running.delete(name);
    opts.log?.info?.({ name }, '[orchestrator] Consumer stopped');
    return { stopped: true };
  } catch (err) {
    opts.log?.error?.({ err, name }, '[orchestrator] Consumer stop failed');
    throw err;
  }
}

/**
 * Start all event consumers.
 */
async function startAll(opts = {}) {
  if (!eventBus.isEnabled()) {
    opts.log?.info?.('[orchestrator] Event bus disabled, skipping all consumers');
    return { started: [], skipped: Object.keys(consumers) };
  }

  const log = opts.log || console;
  const started = [];
  const failed = [];
  const skipped = [];

  // Get which consumers to start from env or start all
  const enabledConsumers = process.env.EVENT_BUS_CONSUMERS
    ? process.env.EVENT_BUS_CONSUMERS.split(',').map((s) => s.trim())
    : Object.keys(consumers);

  for (const name of enabledConsumers) {
    if (!consumers[name]) {
      log.warn?.({ name }, '[orchestrator] Unknown consumer, skipping');
      skipped.push(name);
      continue;
    }

    try {
      const result = await startConsumer(name, opts);
      if (result.started) {
        started.push(name);
      } else if (result.alreadyRunning) {
        skipped.push(name);
      } else {
        skipped.push(name);
      }
    } catch (err) {
      log.error?.({ err, name }, '[orchestrator] Failed to start consumer');
      failed.push(name);
    }
  }

  log.info?.({ started, failed, skipped }, '[orchestrator] Consumer startup complete');
  return { started, failed, skipped };
}

/**
 * Stop all event consumers.
 */
async function stopAll(opts = {}) {
  const log = opts.log || console;
  const stopped = [];
  const failed = [];

  for (const name of Object.keys(consumers)) {
    if (!_running.has(name)) continue;

    try {
      await stopConsumer(name, opts);
      stopped.push(name);
    } catch (err) {
      log.error?.({ err, name }, '[orchestrator] Failed to stop consumer');
      failed.push(name);
    }
  }

  // Close producer connection
  await eventBus.close().catch(() => {});

  log.info?.({ stopped, failed }, '[orchestrator] Consumer shutdown complete');
  return { stopped, failed };
}

/**
 * Health check for all consumers.
 */
function healthCheck() {
  const runningCount = _running.size;
  const totalCount = Object.keys(consumers).length;

  return {
    healthy: runningCount > 0 || !eventBus.isEnabled(),
    enabled: eventBus.isEnabled(),
    running: runningCount,
    total: totalCount,
    consumers: Object.keys(consumers).map((name) => ({
      name,
      status: _running.has(name) ? 'running' : 'stopped',
    })),
  };
}

/**
 * Publish event helper — wraps eventBus.publish with standard event format.
 */
async function publishEvent(topic, event) {
  return eventBus.publish(topic, {
    ...event,
    source: 'millo-api',
    version: '1.0',
  });
}

module.exports = {
  getStatus,
  startConsumer,
  stopConsumer,
  startAll,
  stopAll,
  healthCheck,
  publishEvent,
  consumers,
  TOPICS: kafka.TOPICS,
};
