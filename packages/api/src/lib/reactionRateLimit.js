'use strict';
/**
 * Reaction rate limit — Redis token bucket. Max 10 reactions/sec per user.
 * TikTok-style protection against emoji spam.
 * https://milloapp.com
 */
const MAX_PER_SECOND = Number(process.env.REACTION_MAX_PER_SECOND) || 10;
const KEY_PREFIX = 'reaction_rate:';
const TTL_SECONDS = 2;

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
 * Check if user can send a reaction. Uses Redis INCR per user per second.
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, count?: number }>}
 */
async function check(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return { allowed: true };
  const redis = getRedis();
  if (!redis) return { allowed: true }; // graceful degradation
  try {
    const bucket = Math.floor(Date.now() / 1000);
    const key = KEY_PREFIX + uid + ':' + bucket;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, TTL_SECONDS);
    return { allowed: count <= MAX_PER_SECOND, count };
  } catch {
    return { allowed: true };
  }
}

module.exports = { check, MAX_PER_SECOND };
