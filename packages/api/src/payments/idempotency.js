'use strict';
/**
 * Short-TTL idempotency for queued webhook jobs (separate from HTTP-layer Redis dedupe in lib/webhookDedupe.js).
 * https://milloapp.com
 */
const IORedis = require('ioredis');

let _redis = null;

function getRedis() {
  if (_redis !== null) return _redis;
  try {
    const url = process.env.REDIS_URL;
    if (url) {
      _redis = new IORedis(url, { maxRetriesPerRequest: null });
    } else {
      _redis = new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
      });
    }
  } catch {
    _redis = false;
  }
  return _redis;
}

async function isProcessed(key) {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.get(`idem:${key}`)) === '1';
  } catch {
    return false;
  }
}

async function markProcessed(key) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(`idem:${key}`, '1', 'EX', 60 * 60 * 24);
  } catch {
    /* ignore */
  }
}

module.exports = { isProcessed, markProcessed };
