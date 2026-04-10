'use strict';
/**
 * Feature engineering pipeline — turn raw `user_events` into per (user, content) signals.
 * Consumes the same topic as `packages/api/src/events/track.js` (default `user_events`).
 *
 * Enable: FEATURES_KAFKA_WORKER=true, KAFKA_BROKERS (or KAFKA_BROKER), kafkajs installed.
 * Optional: FEATURES_PUBLISH_UPDATES=true — flush aggregates to Kafka `feature.content.updates`.
 * Run: node features.worker.js (from packages/workers) or bundle via workers `src/index.js`.
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

/** In-memory aggregates (one process). For HA, use an external store or partitioned consumers. */
const features = Object.create(null);

const TOPIC_IN = process.env.KAFKA_USER_EVENTS_TOPIC || 'user_events';
const TOPIC_OUT = process.env.KAFKA_FEATURE_CONTENT_UPDATES_TOPIC || 'feature.content.updates';

function getBrokers() {
  const raw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'localhost:9092';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function emptyRow() {
  return {
    watchTime: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    follows: 0,
    skips: 0,
    _dirty: false,
  };
}

/**
 * @param {object} event
 */
function applyEvent(event) {
  const userId = event.userId != null ? String(event.userId) : '';
  const contentId = event.videoId != null ? String(event.videoId) : event.contentId != null ? String(event.contentId) : '';
  if (!userId || !contentId) return;

  const key = `${userId}:${contentId}`;
  if (!features[key]) {
    features[key] = emptyRow();
  }
  const row = features[key];
  const type = String(event.type || '').toUpperCase();

  switch (type) {
    case 'WATCH_TIME': {
      const d = Number(event.duration);
      if (Number.isFinite(d) && d > 0) {
        row.watchTime += d;
        row._dirty = true;
      }
      break;
    }
    case 'LIKE':
      row.likes += 1;
      row._dirty = true;
      break;
    case 'COMMENT':
      row.comments += 1;
      row._dirty = true;
      break;
    case 'SHARE':
      row.shares += 1;
      row._dirty = true;
      break;
    case 'FOLLOW':
      row.follows += 1;
      row._dirty = true;
      break;
    case 'SKIP':
      row.skips += 1;
      row._dirty = true;
      break;
    case 'WATCH_START':
    case 'WATCH_END':
    default:
      break;
  }
}

/**
 * @param {import('kafkajs').Producer} producer
 */
async function flushDirty(producer) {
  if (process.env.FEATURES_PUBLISH_UPDATES !== 'true' || !producer) return;

  const now = new Date().toISOString();
  for (const key of Object.keys(features)) {
    const row = features[key];
    if (!row || !row._dirty) continue;
    row._dirty = false;
    const colon = key.indexOf(':');
    const userId = key.slice(0, colon);
    const contentId = key.slice(colon + 1);
    const payload = {
      source: 'features_worker',
      userId,
      contentId,
      signals: {
        watchTimeSec: row.watchTime,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        follows: row.follows,
        skips: row.skips,
      },
      flushedAt: now,
    };
    try {
      await producer.send({
        topic: TOPIC_OUT,
        messages: [{ key: userId, value: JSON.stringify(payload) }],
      });
    } catch (err) {
      row._dirty = true;
      console.error('[features.worker] flush send failed:', err?.message || err);
    }
  }
}

/**
 * @returns {Promise<void>}
 */
async function startFeaturesKafkaWorker() {
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

  const clientId = process.env.KAFKA_FEATURES_CLIENT_ID || 'millo-features-worker';
  const groupId = process.env.KAFKA_FEATURES_GROUP_ID || 'millo-features-group';

  const kafka = new Kafka({ clientId, brokers });
  const consumer = kafka.consumer({ groupId });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();

  await consumer.subscribe({ topic: TOPIC_IN, fromBeginning: false });

  const flushMs = Math.max(5000, parseInt(process.env.FEATURES_FLUSH_INTERVAL_MS, 10) || 30000);
  const flushTimer = setInterval(() => {
    flushDirty(producer).catch((err) => console.error('[features.worker] flush:', err?.message || err));
  }, flushMs);
  const stopFlush = () => clearInterval(flushTimer);
  process.once('SIGINT', stopFlush);
  process.once('SIGTERM', stopFlush);

  const runPromise = consumer.run({
    eachMessage: async ({ message }) => {
      let event = {};
      try {
        const raw = message.value ? message.value.toString() : '{}';
        event = raw ? JSON.parse(raw) : {};
      } catch {
        return;
      }
      try {
        applyEvent(event);
      } catch (err) {
        console.error('[features.worker] applyEvent:', err?.message || err);
      }
    },
  });

  console.info(
    '[features.worker] consuming',
    TOPIC_IN,
    process.env.FEATURES_PUBLISH_UPDATES === 'true' ? `→ flush ${TOPIC_OUT}` : '(in-memory only; set FEATURES_PUBLISH_UPDATES=true to emit)',
    'interval',
    flushMs,
    'ms',
  );
  return runPromise;
}

async function main() {
  await startFeaturesKafkaWorker();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[features.worker]', err);
    process.exit(1);
  });
}

module.exports = {
  startFeaturesKafkaWorker,
  applyEvent,
  TOPIC_IN,
  TOPIC_OUT,
};
