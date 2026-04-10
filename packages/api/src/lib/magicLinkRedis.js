'use strict';
/**
 * Magic link tokens stored in Redis — key: magic_link:{token} = userId
 * Short TTL (default 10 minutes). Used by /auth/magic-link and /auth/magic-link/verify.
 * https://milloapp.com
 */

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

const KEY_PREFIX = 'magic_link:';
const DEFAULT_TTL_SEC = 10 * 60; // 10 minutes

async function storeToken(token, userId, ttlSec = DEFAULT_TTL_SEC) {
  const redis = getRedis();
  if (!redis || !token || !userId) return false;
  const key = KEY_PREFIX + String(token);
  await redis.setex(key, ttlSec, String(userId));
  return true;
}

async function consumeToken(token) {
  const redis = getRedis();
  if (!redis || !token) return null;
  const key = KEY_PREFIX + String(token);
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key).catch(() => {});
  return userId;
}

module.exports = { getRedis, storeToken, consumeToken, KEY_PREFIX, DEFAULT_TTL_SEC };

