'use strict';
/**
 * Redis distributed lock — SET NX EX for API-layer critical sections.
 * Prefer @millo/economy debit (already wallet-locked) for ledger; use this for API-only sequences.
 * https://milloapp.com
 */
const { redis } = require('../lib/redis');

/**
 * @param {string} key - Logical resource id (stored as lock:{key})
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withLock(key, fn) {
  const lockKey = `lock:${key}`;

  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 5);
  if (acquired !== 'OK') throw new Error('Concurrent operation');

  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

module.exports = { withLock };
