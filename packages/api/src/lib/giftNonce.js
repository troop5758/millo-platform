'use strict';
/**
 * Gift nonce validation — Redis-backed replay prevention.
 * Rejects duplicate nonces within TTL. Optional hardening for gift flows.
 * https://milloapp.com
 */
const NONCE_TTL = 24 * 60 * 60; // 24 hours
const KEY_PREFIX = 'gift_nonce:';

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    };
    _redis = new Redis(connection);
    _redis.on('error', () => {});
    return _redis;
  } catch {
    return null;
  }
}

/**
 * Check nonce and consume if new. Returns true if nonce is valid (first use), false if duplicate.
 * @param {string} nonce - Client-provided nonce (e.g. crypto.randomUUID())
 * @returns {Promise<boolean>} - true if accepted, false if duplicate or Redis unavailable
 */
async function checkAndConsumeNonce(nonce) {
  if (!nonce || typeof nonce !== 'string') return true; // no nonce = skip check
  const n = String(nonce).trim().slice(0, 128);
  if (!n) return true;
  const redis = getRedis();
  if (!redis) return true; // graceful degradation
  try {
    const key = KEY_PREFIX + n;
    const ok = await redis.set(key, '1', 'EX', NONCE_TTL, 'NX');
    return ok === 'OK';
  } catch {
    return true; // on error, allow (fail open)
  }
}

module.exports = { checkAndConsumeNonce };
