'use strict';
/**
 * Redis viewer counter — Phase 4. Key: live:viewers:{streamId}.
 * INCR on join, DECR on leave (guarded). Replaces Mongo for real-time count.
 * https://milloapp.com
 */
const KEY_PREFIX = 'live:viewers:';
const TTL_SECONDS = 24 * 60 * 60; // 24h

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
    const REDIS_URL = process.env.REDIS_URL;
    const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
    _redis = REDIS_URL ? new Redis(REDIS_URL) : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
    _redis.on('error', () => {});
    return _redis;
  } catch {
    return null;
  }
}

function key(streamId) {
  return KEY_PREFIX + String(streamId);
}

/**
 * Increment viewer count for stream (call on join).
 * @param {string} streamId
 * @returns {Promise<number>} new count, or -1 if Redis unavailable
 */
async function incr(streamId) {
  const redis = getRedis();
  if (!redis || !streamId) return -1;
  try {
    const k = key(streamId);
    const count = await redis.incr(k);
    await redis.expire(k, TTL_SECONDS);
    return count;
  } catch {
    return -1;
  }
}

/**
 * Decrement viewer count for stream (call on leave). Never goes below 0.
 * @param {string} streamId
 * @returns {Promise<number>} new count, or -1 if Redis unavailable
 */
async function decr(streamId) {
  const redis = getRedis();
  if (!redis || !streamId) return -1;
  try {
    const k = key(streamId);
    const count = await redis.decr(k);
    if (count < 0) {
      await redis.set(k, '0');
      return 0;
    }
    await redis.expire(k, TTL_SECONDS);
    return count;
  } catch {
    return -1;
  }
}

/**
 * Get current viewer count from Redis.
 * @param {string} streamId
 * @returns {Promise<number|null>} count or null if Redis unavailable
 */
async function get(streamId) {
  const redis = getRedis();
  if (!redis || !streamId) return null;
  try {
    const val = await redis.get(key(streamId));
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  } catch {
    return null;
  }
}

/**
 * Set viewer count (e.g. for sync worker or reset). Use with care.
 * @param {string} streamId
 * @param {number} count
 */
async function set(streamId, count) {
  const redis = getRedis();
  if (!redis || !streamId) return;
  try {
    const k = key(streamId);
    await redis.set(k, String(Math.max(0, Math.floor(count))));
    await redis.expire(k, TTL_SECONDS);
  } catch {}
}

module.exports = { incr, decr, get, set, KEY_PREFIX };
