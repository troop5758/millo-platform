'use strict';
/**
 * Rank training sample pipeline — consumes feed.watch, feed.engagement, feed.negative;
 * derives supervised labels and publishes rows to `rank.train.samples` for offline joins / training.
 *
 * Enable: KAFKA_ENABLED=true && KAFKA_RANK_TRAINING_SAMPLE_CONSUMER_ENABLED=true
 * Group: KAFKA_RANK_TRAINING_SAMPLE_GROUP_ID (default rank-training-samples)
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const { deriveLabels } = require('../lib/rankTrainingLabels');

let _consumer = null;

/**
 * Build outbound training row (impression join happens downstream in warehouse / spark).
 * @param {string} topic
 * @param {object} payload
 * @param {ReturnType<typeof deriveLabels>} derived
 */
function buildSample(topic, payload, derived) {
  const p = payload || {};
  const userId = p.userId != null ? String(p.userId) : '';
  const contentId = p.contentId != null ? String(p.contentId) : '';
  if (!userId || !contentId) return null;

  return {
    event: 'rank.training.sample',
    source: 'rank-training-sample-worker',
    sourceTopic: topic,
    userId,
    contentId,
    sessionId: p.sessionId != null ? String(p.sessionId) : null,
    position: p.position != null ? Number(p.position) : null,
    labels: derived.labels,
    polarity: derived.polarity,
    reason: derived.reason || null,
    watchTimeMs: p.watchTimeMs != null ? Number(p.watchTimeMs) : null,
    tsOriginal: p.ts || null,
    envelope: p,
  };
}

async function handlePayload(payload, topic) {
  const derived = deriveLabels(topic, payload);
  if (!derived || !derived.labels?.length) return;

  const sample = buildSample(topic, payload, derived);
  if (!sample) return;

  const result = await kafka.publish(kafka.TOPICS.RANK_TRAIN_SAMPLES, sample, {
    key: `${sample.userId}:${sample.contentId}`,
  });
  if (!result.ok && !result.skipped && process.env.NODE_ENV !== 'production') {
    console.warn('[rankTrainingSample] publish failed:', result.error);
  }
}

async function start(opts = {}) {
  const log = opts.log || console;
  if (!kafka.isEnabled()) {
    log.info?.('[rankTrainingSample] Kafka disabled, skipping');
    return { consumer: null, run: Promise.resolve() };
  }
  if (process.env.KAFKA_RANK_TRAINING_SAMPLE_CONSUMER_ENABLED !== 'true') {
    log.info?.('[rankTrainingSample] Set KAFKA_RANK_TRAINING_SAMPLE_CONSUMER_ENABLED=true to run');
    return { consumer: null, run: Promise.resolve() };
  }

  const groupId = process.env.KAFKA_RANK_TRAINING_SAMPLE_GROUP_ID || 'rank-training-samples';
  const topics = [
    kafka.TOPICS.FEED_WATCH,
    kafka.TOPICS.FEED_ENGAGEMENT,
    kafka.TOPICS.FEED_NEGATIVE,
  ];

  const { consumer, run } = await kafka.startConsumer(
    groupId,
    topics,
    (payload, t) => handlePayload(payload, t),
    { fromBeginning: false, log },
  );
  _consumer = consumer;
  if (run) run.catch((err) => log.error?.({ err }, '[rankTrainingSample] run error'));
  log.info?.({ topics, groupId }, '[rankTrainingSample] started');
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

module.exports = { start, stop, handlePayload, buildSample };
