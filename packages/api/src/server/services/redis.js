'use strict';
/**
 * Redis — cache + optional custom rate limiting.
 * Uses the same ioredis singleton factory as @fastify/rate-limit (REDIS_URL / REDIS_HOST).
 *
 * Docker (dev): docker run -d -p 6379:6379 redis
 * Env: REDIS_URL=redis://localhost:6379
 * https://milloapp.com
 */
const { getRedis } = require('../../lib/rateLimitRedisStore');

let _client = null;
function ensureClient() {
  if (!_client) _client = getRedis();
  return _client;
}

function isRedisConfigured() {
  return !!(
    process.env.REDIS_URL
    || process.env.REDIS_HOST
    || process.env.RATE_LIMIT_USE_REDIS === 'true'
  );
}

/**
 * Default export style: `redis.get(...)` forwards to ioredis (lazy connect).
 * Also exposes `getFeed`, `rateLimit`, `isRedisConfigured`.
 */
const redis = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'getFeed') return getFeed;
      if (prop === 'rateLimit') return rateLimit;
      if (prop === 'isRedisConfigured') return isRedisConfigured;
      const r = ensureClient();
      const v = r[prop];
      return typeof v === 'function' ? v.bind(r) : v;
    },
  },
);

/**
 * Cached feed — keys by feedType + user + pagination + content filter hash (short).
 * @param {string|null|undefined} userId
 * @param {{ feedType?: string, limit?: number, offset?: number, region?: object, contentFilter?: object }} [options]
 */
async function getFeed(userId, options = {}) {
  const feedType = options.feedType || (userId ? 'following' : 'global');
  const limit = Math.min(Number(options.limit) || 20, 50);
  const offset = Math.max(0, Number(options.offset) || 0);
  const region = options.region || {};
  const contentFilter = options.contentFilter || {};
  const filterKey = contentFilter && Object.keys(contentFilter).length
    ? Buffer.from(JSON.stringify(contentFilter)).toString('base64url').slice(0, 32)
    : 'none';

  const cacheKey = `feed:${feedType}:${userId || 'anon'}:${limit}:${offset}:${filterKey}`;
  const ttlSec = Number(process.env.FEED_CACHE_TTL_SEC) || 60;

  if (isRedisConfigured()) {
    try {
      const cached = await ensureClient().get(cacheKey);
      if (cached) {
        try {
          const { recordRedisCacheHit } = require('../../routes/metrics');
          recordRedisCacheHit('feed');
        } catch (_) { /* metrics optional */ }
        return JSON.parse(cached);
      }
      try {
        const { recordRedisCacheMiss } = require('../../routes/metrics');
        recordRedisCacheMiss('feed');
      } catch (_) { /* metrics optional */ }
    } catch (_) { /* miss or Redis down */ }
  }

  const discovery = require('@millo/discovery');
  const feed = await discovery.getFeed(feedType, {
    userId,
    limit,
    offset,
    region,
    contentFilter,
  });

  if (isRedisConfigured()) {
    try {
      await ensureClient().set(cacheKey, JSON.stringify(feed), 'EX', ttlSec);
    } catch (_) { /* non-fatal */ }
  }

  return feed;
}

/**
 * Simple counter window (incr + TTL on first hit).
 * @param {string} key - Logical key (will be prefixed)
 * @param {{ windowSec?: number, max?: number }} [opts] - default 60s / 100 hits
 */
async function rateLimit(key, opts = {}) {
  const windowSec = opts.windowSec ?? 60;
  const max = opts.max ?? 100;
  const fullKey = `rl:boost:${key}`;

  if (!isRedisConfigured()) {
    return { count: 1, limited: false, skipped: true };
  }

  const r = ensureClient();
  const count = await r.incr(fullKey);
  if (count === 1) {
    await r.expire(fullKey, windowSec);
  }
  if (count > max) {
    const err = new Error('Rate limit exceeded');
    err.code = 'RATE_LIMITED';
    throw err;
  }
  return { count, limited: false };
}

module.exports = redis;
module.exports.getFeed = getFeed;
module.exports.rateLimit = rateLimit;
module.exports.isRedisConfigured = isRedisConfigured;
module.exports.ensureClient = ensureClient;
