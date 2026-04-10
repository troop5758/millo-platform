'use strict';
/**
 * Redis atomic locking — NX EX for economy operations (double-spend prevention).
 * https://milloapp.com
 */
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

let _client = null;

function getClient() {
  if (_client) return _client;
  _client = REDIS_URL
    ? new Redis(REDIS_URL)
    : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  return _client;
}

/**
 * Acquire a lock. Returns 'OK' if acquired, null if key already exists.
 * Uses NX + PX (milliseconds) for ledger lock compatibility (e.g. lock:ledger:{userId}, 5000ms).
 * @param {string} key - Lock key (e.g. 'lock:ledger:userId')
 * @param {number} [ttlSeconds=5] - Lock TTL in seconds (converted to PX ms when ttlMs not provided)
 * @param {number} [ttlMs] - Optional TTL in milliseconds (uses PX); overrides ttlSeconds
 * @returns {Promise<string|null>} 'OK' if acquired, null if not
 */
async function acquireLock(key, ttlSeconds = 5, ttlMs) {
  try {
    const redis = getClient();
    if (ttlMs != null) {
      const result = await redis.set(key, '1', 'NX', 'PX', ttlMs);
      return result;
    }
    const result = await redis.set(key, '1', 'NX', 'PX', ttlSeconds * 1000);
    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Release a lock (delete the key).
 * @param {string} key
 * @returns {Promise<number>} 1 if deleted, 0 if not found
 */
async function releaseLock(key) {
  try {
    const redis = getClient();
    return redis.del(key);
  } catch {
    return 0;
  }
}

/**
 * Execute fn with lock. Acquires lock (NX PX 5000ms default), runs fn, releases lock.
 * Throws if lock cannot be acquired.
 * @param {string} key - e.g. lock:ledger:{userId}
 * @param {() => Promise<T>} fn
 * @param {number} [ttlSeconds=5] - TTL in seconds (stored as PX ms)
 * @returns {Promise<T>}
 */
async function withLock(key, fn, ttlSeconds = 5) {
  const acquired = await acquireLock(key, ttlSeconds);
  if (!acquired) throw new Error('Concurrent operation');
  try {
    return await fn();
  } finally {
    await releaseLock(key);
  }
}

module.exports = { acquireLock, releaseLock, withLock, getClient };
