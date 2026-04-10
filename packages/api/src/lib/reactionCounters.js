'use strict';
/**
 * Reaction Service — aggregate emoji counts in Redis (TikTok-style).
 * Emojis are not stored individually; counters allow millions of reactions per minute.
 * Key: live:reactions:{streamId}  Value: Hash { emoji: count }
 * https://milloapp.com
 */
const KEY_PREFIX = 'live:reactions:';
const TTL_SECONDS = 24 * 60 * 60; // 24h — expire after stream ends

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

/**
 * Increment emoji counter for a stream. Atomic, O(1).
 * @param {string} streamId
 * @param {string} emoji
 * @returns {Promise<number>} new count, or 0 if Redis unavailable
 */
async function increment(streamId, emoji) {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const key = KEY_PREFIX + String(streamId);
    const count = await redis.hincrby(key, emoji, 1);
    await redis.expire(key, TTL_SECONDS);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Get all emoji counts for a stream.
 * @param {string} streamId
 * @returns {Promise<Record<string, number>>} { '🔥': 120, '❤️': 340, ... }
 */
async function getCounts(streamId) {
  const redis = getRedis();
  if (!redis) return {};
  try {
    const key = KEY_PREFIX + String(streamId);
    const hash = await redis.hgetall(key);
    const out = {};
    for (const [k, v] of Object.entries(hash || {})) {
      out[k] = parseInt(v, 10) || 0;
    }
    return out;
  } catch {
    return {};
  }
}

module.exports = { increment, getCounts, KEY_PREFIX };
