/**
 * Watermark Anti-Piracy System — dynamic watermark for every video stream.
 * Includes: user_id, timestamp, session_id. Enables piracy traceability.
 * https://milloapp.com
 */
const crypto = require('crypto');
const db = require('@millo/database');

const DEFAULT_WATERMARK = {
  enabled: true,
  text: 'Purchase to watch',
  opacity: 0.6,
  position: 'center',
};

/**
 * Generate dynamic anti-piracy watermark for a viewer.
 * Includes user_id, timestamp, session_id for traceability.
 */
function generateWatermark(userId, sessionId) {
  const timestamp = Date.now();
  const sid = sessionId || crypto.randomBytes(8).toString('hex');
  const uid = userId ? String(userId).slice(-8) : 'anon';
  return `USER:${uid} | TIME:${timestamp} | SESSION:${sid}`;
}

/**
 * Generate watermark payload for client overlay (text + metadata).
 */
function getWatermarkPayload(userId, sessionId) {
  const timestamp = Date.now();
  const sid = sessionId || crypto.randomBytes(8).toString('hex');
  const uid = userId ? String(userId) : null;
  const text = generateWatermark(uid || 'anon', sid);
  return {
    text,
    userId: uid,
    timestamp,
    sessionId: sid,
    expiresAt: timestamp + 3600000,
  };
}

async function getWatermarkConfig(streamId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) return null;
  if (stream.visibility !== 'paid') return { enabled: false };
  const config = stream.meta?.watermark || DEFAULT_WATERMARK;
  return { ...DEFAULT_WATERMARK, ...config };
}

async function setWatermarkConfig(creatorId, streamId, config) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.userId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');
  stream.meta = stream.meta || {};
  stream.meta.watermark = { ...(stream.meta.watermark || {}), ...config };
  await stream.save();
  return stream.meta.watermark;
}

module.exports = {
  generateWatermark,
  getWatermarkPayload,
  getWatermarkConfig,
  setWatermarkConfig,
  DEFAULT_WATERMARK,
};
