'use strict';
/**
 * Redis real-time gift leaderboard per stream.
 * Key: live:gift:leaderboard:{streamId} (sorted set)
 * Member: userId, Score: total coins sent to this stream.
 * ZINCRBY on each gift; ZREVRANGE for top supporters.
 * https://milloapp.com
 */
const KEY_PREFIX = 'live:gift:leaderboard:';
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

/**
 * Increment a user's gift total for a stream (call after successful gift).
 * @param {string} streamId
 * @param {string} userId
 * @param {number} coins
 * @returns {Promise<number>} new score for that user, or 0 if Redis unavailable
 */
async function increment(streamId, userId, coins) {
  const redis = getRedis();
  if (!redis || !streamId || !userId || coins <= 0) return 0;
  try {
    const key = KEY_PREFIX + String(streamId);
    const member = String(userId);
    const score = await redis.zincrby(key, coins, member);
    await redis.expire(key, TTL_SECONDS);
    return Number(score);
  } catch {
    return 0;
  }
}

/**
 * Get top gifters for a stream (descending by coins).
 * @param {string} streamId
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ userId: string, coins: number }>>}
 */
async function getTop(streamId, limit = 50) {
  const redis = getRedis();
  if (!redis || !streamId) return [];
  try {
    const key = KEY_PREFIX + String(streamId);
    const n = Math.min(Math.max(1, Number(limit) || 50), 100);
    const raw = await redis.zrevrange(key, 0, n - 1, 'WITHSCORES');
    const out = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({
        userId: raw[i],
        coins: Math.round(Number(raw[i + 1]) || 0),
      });
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = { increment, getTop, KEY_PREFIX };
