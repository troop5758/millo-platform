'use strict';
/**
 * Redis-backed rate limit store for @fastify/rate-limit — shared limits across API instances.
 * Used when RATE_LIMIT_USE_REDIS=true or REDIS_HOST is set. https://milloapp.com
 */
const Redis = require('ioredis');

const KEY_PREFIX = 'rate_limit:';

let _redis = null;

function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) return { url };
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

function getRedis() {
  if (_redis) return _redis;
  const conn = getConnection();
  _redis = conn.url ? new Redis(conn.url) : new Redis(conn);
  _redis.on('error', () => {});
  return _redis;
}

/**
 * Create a rate limit store for @fastify/rate-limit (incr callback API; ttl in ms).
 * @param {number} timeWindowMs - Window in ms (from getRateLimitConfig().timeWindow)
 * @returns {{ incr: (key: string, cb: (err, result) => void) => void, child?: (opts) => store }}
 */
function createRateLimitRedisStore(timeWindowMs) {
  const redis = getRedis();
  const ttlSec = Math.max(1, Math.ceil((timeWindowMs || 60000) / 1000));
  const ttlMs = ttlSec * 1000;

  function incr(key, cb) {
    const fullKey = KEY_PREFIX + key;
    const multi = redis.multi();
    multi.incr(fullKey);
    multi.pttl(fullKey);
    multi.exec()
      .then((results) => {
        if (!results || results.length < 2) {
          return cb(null, { current: 1, ttl: ttlMs });
        }
        const [[, count], [, pttl]] = results;
        const current = Number(count) || 1;
        const ttlMsRemaining = pttl > 0 ? pttl : ttlMs;
        if (pttl === -1 || pttl === -2) redis.expire(fullKey, ttlSec).catch(() => {});
        return cb(null, { current, ttl: ttlMsRemaining });
      })
      .catch((err) => cb(err, null));
  }

  function child(opts = {}) {
    const childWindowMs = opts.timeWindow ?? timeWindowMs;
    return createRateLimitRedisStore(childWindowMs);
  }

  return { incr, child };
}

function isRedisRateLimitEnabled() {
  if (process.env.RATE_LIMIT_USE_REDIS === 'true') return true;
  return !!(process.env.REDIS_HOST || process.env.REDIS_URL);
}

module.exports = {
  createRateLimitRedisStore,
  isRedisRateLimitEnabled,
  getRedis,
  KEY_PREFIX,
};
