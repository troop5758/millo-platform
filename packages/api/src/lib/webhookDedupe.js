'use strict';
/**
 * Webhook idempotency — Redis SET NX per provider event key (Stripe event.id, PayPal event id, etc.).
 * When Redis is unavailable, returns { first: true } so processing still runs (downstream money ops keep their own keys).
 * https://milloapp.com
 */
const { getRedis, isRedisRateLimitEnabled } = require('./rateLimitRedisStore');

const KEY_PREFIX = 'millo:wh:dedupe:';

/**
 * @param {string} provider - e.g. stripe, paypal, wise
 * @param {string} externalId - stable unique id for this delivery (event id, etc.)
 * @param {number} [ttlSec=172800] - default 48h
 * @returns {Promise<{ first: boolean }>}
 */
async function markWebhookFirstSeen(provider, externalId, ttlSec = 172800) {
  if (!externalId || !isRedisRateLimitEnabled()) return { first: true };
  const safeProvider = String(provider || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
  const safeId = String(externalId).slice(0, 256);
  try {
    const r = getRedis();
    const key = `${KEY_PREFIX}${safeProvider}:${safeId}`;
    const res = await r.set(key, '1', 'EX', Math.max(60, ttlSec), 'NX');
    return { first: res === 'OK' };
  } catch {
    return { first: true };
  }
}

module.exports = { markWebhookFirstSeen, KEY_PREFIX };
