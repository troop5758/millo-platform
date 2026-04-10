'use strict';
/**
 * Kafka moderation consumer — chat-messages, uploads, live-video-frames → moderation-results.
 * Pipeline: user message → `chat-messages` (see api liveEventsKafka) → this worker → `moderation-results`
 * → api moderationResultsEnforcementConsumer → enforcement.service + enforcementEngine.
 * Enable: MODERATION_KAFKA_WORKER=true, KAFKA_BROKERS (or KAFKA_BROKER), kafkajs installed.
 * API side: KAFKA_ENABLED=true, start `moderationResults` consumer (event bus orchestrator).
 * Run standalone: node moderation.worker.js (from packages/workers)
 * Or bundled: set MODERATION_KAFKA_WORKER=true when starting src/index.js
 * https://milloapp.com
 */

const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val) process.env[m[1]] = val;
    }
  }
}

const { moderateText, sampleFrames } = require('./moderation/ai');

const TOPICS = Object.freeze({
  CHAT_MESSAGES: 'chat-messages',
  UPLOADS: 'uploads',
  LIVE_VIDEO_FRAMES: 'live-video-frames',
  MODERATION_RESULTS: 'moderation-results',
});

function getBrokers() {
  const raw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'localhost:9092';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {object} data
 * @returns {Promise<string | null>} text to scan
 */
async function extractTextForTopic(topic, data) {
  if (topic === TOPICS.CHAT_MESSAGES) {
    return data.text != null ? String(data.text) : data.message != null ? String(data.message) : null;
  }
  if (topic === TOPICS.UPLOADS) {
    return data.caption != null ? String(data.caption) : data.text != null ? String(data.text) : data.description != null ? String(data.description) : null;
  }
  if (topic === TOPICS.LIVE_VIDEO_FRAMES) {
    return data.label != null ? String(data.label) : null;
  }
  return null;
}

async function handleMessage(topic, rawValue, producer) {
  let data = {};
  try {
    data = rawValue ? JSON.parse(rawValue.toString()) : {};
  } catch {
    return;
  }

  const userId = data.userId != null ? String(data.userId) : data.user_id != null ? String(data.user_id) : null;
  const streamId = data.streamId != null ? String(data.streamId) : null;

  if (topic === TOPICS.LIVE_VIDEO_FRAMES) {
    await sampleFrames(data.stream || data.payload).catch(() => []);
    // Vision path: when frames exist, run NSFW/violence models and set flagged below.
  }

  const text = await extractTextForTopic(topic, data);
  if (text == null && topic !== TOPICS.LIVE_VIDEO_FRAMES) return;

  const result = text != null ? await moderateText(text) : { flagged: false };

  if (!result.flagged) return;

  const violation = result.reason || 'POLICY_VIOLATION';
  const out = {
    userId,
    streamId,
    action: 'FLAG',
    reason: violation,
    violation,
    sourceTopic: topic,
    ts: new Date().toISOString(),
  };

  await producer.send({
    topic: TOPICS.MODERATION_RESULTS,
    messages: [
      {
        key: userId || undefined,
        value: JSON.stringify(out),
      },
    ],
  });
}

/**
 * @returns {Promise<void>} Resolves when consumer is connected and run loop is scheduled (run itself is long-lived).
 */
async function startModerationKafkaWorker() {
  let Kafka;
  try {
    ({ Kafka } = require('kafkajs'));
  } catch {
    throw new Error('Install kafkajs in @millo/workers: npm install kafkajs');
  }

  const brokers = getBrokers();
  if (!brokers.length) {
    throw new Error('KAFKA_BROKERS or KAFKA_BROKER required');
  }

  const clientId = process.env.KAFKA_MODERATION_CLIENT_ID || 'millo-moderation-worker';
  const groupId = process.env.KAFKA_MODERATION_GROUP_ID || 'moderation-group';

  const kafka = new Kafka({ clientId, brokers });
  const consumer = kafka.consumer({ groupId });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();

  const inputs = [TOPICS.CHAT_MESSAGES, TOPICS.UPLOADS, TOPICS.LIVE_VIDEO_FRAMES];
  for (const t of inputs) {
    await consumer.subscribe({ topic: t, fromBeginning: false });
  }

  const runPromise = consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        await handleMessage(topic, message.value, producer);
      } catch (err) {
        console.error('[moderation.worker] handleMessage error:', err?.message || err);
      }
    },
  });

  console.info('[moderation.worker] consuming', inputs.join(', '), '→', TOPICS.MODERATION_RESULTS);
  return runPromise;
}

async function main() {
  await startModerationKafkaWorker();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[moderation.worker]', err);
    process.exit(1);
  });
}

module.exports = {
  startModerationKafkaWorker,
  TOPICS,
};
