'use strict';
/**
 * Distributed lock helper — SET NX PX + Lua compare-and-del release.
 * Uses the same ioredis singleton as rate limiting when Redis is configured.
 *
 * When Redis is not configured:
 * - Production + REDIS_LOCK_REQUIRED=true → throws (503)
 * - Otherwise runs `fn` without locking (lock.skipped: true)
 *
 * https://milloapp.com
 */
const crypto = require('crypto');

const { getRedis } = require('./rateLimitRedisStore');

const LOCK_PREFIX = 'millo:lock:';

function isRedisConfigured() {
  return !!(
    process.env.REDIS_URL
    || process.env.REDIS_HOST
    || process.env.RATE_LIMIT_USE_REDIS === 'true'
  );
}

/** Thrown when another holder owns the lock (HTTP 409 recommended). */
class LockContentionError extends Error {
  constructor(key) {
    super(`Lock already held: ${key}`);
    this.name = 'LockContentionError';
    this.code = 'REDIS_LOCK_HELD';
    this.statusCode = 409;
  }
}

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * @param {string} key - Logical lock key (will be prefixed)
 * @param {number} ttlMs - TTL in milliseconds
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, lock: { acquired?: boolean, skipped?: boolean, key: string } }>}
 */
async function withRedisLock(key, ttlMs, fn) {
  const safeKey = String(key || '').replace(/\s+/g, '').slice(0, 200);
  if (!safeKey) throw new Error('LOCK_KEY_REQUIRED');

  const fullKey = LOCK_PREFIX + safeKey;

  if (!isRedisConfigured()) {
    if (process.env.REDIS_LOCK_REQUIRED === 'true' && process.env.NODE_ENV === 'production') {
      const e = new Error('REDIS_REQUIRED_FOR_LOCKS');
      e.statusCode = 503;
      e.code = 'REDIS_LOCK_REQUIRED';
      throw e;
    }
    const result = await fn();
    return { result, lock: { skipped: true, key: fullKey } };
  }

  const redis = getRedis();
  const token = crypto.randomBytes(24).toString('hex');
  const ttl = Math.min(Math.max(Number(ttlMs) || 5000, 1000), 120_000);

  const acquired = await redis.set(fullKey, token, 'NX', 'PX', ttl);
  if (acquired !== 'OK') {
    throw new LockContentionError(fullKey);
  }

  try {
    const result = await fn();
    return { result, lock: { acquired: true, key: fullKey } };
  } finally {
    try {
      await redis.eval(RELEASE_LUA, 1, fullKey, token);
    } catch (releaseErr) {
      /* Non-fatal: key expires via PX */
    }
  }
}

module.exports = {
  withRedisLock,
  LockContentionError,
  isRedisConfigured,
  LOCK_PREFIX,
};
