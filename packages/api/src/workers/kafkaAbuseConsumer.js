'use strict';
/**
 * Kafka abuse detection consumer — subscribes to user_activity, auth_events, payments, live_events, moderation_events.
 * Runs runBehaviorAnalysis, detectATO, detectGiftFraud, detectLiveAbuse, handleModerationEvent.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const {
  runBehaviorAnalysis,
  detectATO,
  detectGiftFraud,
  detectLiveAbuse,
  handleModerationEvent,
} = require('../services/kafkaAbuseHandlers');

const TOPICS = kafka.TOPICS;

let _consumer = null;
let _runPromise = null;

function registerHandlers() {
  const trustGraphWorker = require('./trustGraphWorker');
  trustGraphWorker.registerKafkaHandlers();

  kafka.addAbuseHandler(TOPICS.USER_ACTIVITY, runBehaviorAnalysis);
  kafka.addAbuseHandler(TOPICS.AUTH_EVENTS, detectATO);
  kafka.addAbuseHandler(TOPICS.PAYMENTS, detectGiftFraud);
  kafka.addAbuseHandler(TOPICS.LIVE_EVENTS, detectLiveAbuse);
  kafka.addAbuseHandler(TOPICS.MODERATION, handleModerationEvent);
  kafka.addAbuseHandler(TOPICS.MODERATION_EVENTS, handleModerationEvent);
}

/**
 * Start the abuse consumer. Registers handlers and runs the consumer (long-running).
 * @param {{ log?: object }} [opts]
 * @returns {Promise<{ consumer: object | null }>}
 */
async function start(opts = {}) {
  if (!kafka.isEnabled()) {
    opts.log?.info?.('[kafkaAbuseConsumer] Kafka disabled, skipping');
    return { consumer: null };
  }
  registerHandlers();
  const { consumer, run } = await kafka.startAbuseConsumer(null, {
    fromBeginning: false,
    log: opts.log || console,
  });
  _consumer = consumer;
  _runPromise = run;
  return { consumer };
}

async function stop() {
  _runPromise = null;
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch (_) {}
    _consumer = null;
  }
}

module.exports = { start, stop, registerHandlers };
