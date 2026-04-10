'use strict';
/**
 * Distributed lock for money operations (Redis). Same process composes with ledger idempotency.
 * Key space: `lock:${resourceKey}` — use e.g. `ledger:${userId}`.
 * https://milloapp.com
 */
const { randomBytes } = require('crypto');
const { redis } = require('../../lib/redis');

const DEFAULT_TTL_MS = 30_000;
const UNLOCK_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/**
 * @param {string} resourceKey - e.g. `ledger:${userId}`
 * @param {() => Promise<T>} fn
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
async function withLock(resourceKey, fn, opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = String(resourceKey || '').trim();
  if (!key) {
    const err = new Error('LOCK_KEY_REQUIRED');
    err.code = 'LOCK_KEY_REQUIRED';
    throw err;
  }
  const lockKey = `lock:${key}`;
  const token = randomBytes(16).toString('hex');
  const ok = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') {
    const err = new Error('LOCK_NOT_ACQUIRED');
    err.code = 'LOCK_NOT_ACQUIRED';
    err.resourceKey = key;
    throw err;
  }
  try {
    return await fn();
  } finally {
    try {
      await redis.eval(UNLOCK_LUA, 1, lockKey, token);
    } catch (_) {
      /* best-effort release */
    }
  }
}

module.exports = { withLock, DEFAULT_TTL_MS };
