'use strict';
/**
 * Fan-out live chat: `live_events` (analytics) + `chat-messages` (real-time moderation pipeline).
 * Real-time UX still uses WebSocket + Redis viewer counts; Kafka is the durable stream.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');

/**
 * @param {object} entry
 * @param {string} entry.streamId
 * @param {string} [entry.userId]
 * @param {string} [entry.displayName]
 * @param {string} entry.text
 * @param {string} [entry.messageId]
 * @param {number} [entry.ts]
 * @param {'websocket'|'rest'} [entry.source]
 */
function publishLiveChatMessage(entry) {
  if (!entry?.streamId || !entry.text) return Promise.resolve({ ok: false, skipped: true });
  const streamId = String(entry.streamId);
  const text = String(entry.text).slice(0, 500);
  const ts = entry.ts != null ? entry.ts : Date.now();
  const liveEnvelope = {
    event: 'live.chat.message',
    streamId,
    userId: entry.userId ? String(entry.userId) : null,
    displayName: entry.displayName || null,
    text,
    messageId: entry.messageId || null,
    timestamp: ts,
    source: entry.source || 'api',
  };
  const moderationPayload = {
    streamId,
    userId: entry.userId ? String(entry.userId) : null,
    text,
    messageId: entry.messageId || null,
    displayName: entry.displayName || null,
    ts,
    source: entry.source || 'api',
  };
  return Promise.all([
    kafka.publish(kafka.TOPICS.LIVE_EVENTS, liveEnvelope),
    kafka.publish(kafka.TOPICS.CHAT_MESSAGES, moderationPayload, {
      key: entry.userId ? String(entry.userId) : undefined,
    }),
  ])
    .then(() => ({ ok: true }))
    .catch(() => ({ ok: false }));
}

module.exports = { publishLiveChatMessage };
