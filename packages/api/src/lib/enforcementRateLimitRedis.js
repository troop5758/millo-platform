'use strict';
/**
 * Redis key for enforcement-applied user rate limit (stricter limits for high-risk users).
 * Set by enforcement engine; API can check isUserRateLimited(userId) and apply stricter limits or 429.
 * https://milloapp.com
 */
const Redis = require('ioredis');

const KEY_PREFIX = 'enforcement_rate_limit:';
const DEFAULT_TTL_SEC = 24 * 60 * 60; // 24h

let _redis = null;

function getConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}

function getRedis() {
  if (_redis) return _redis;
  const conn = getConnection();
  _redis = new Redis(conn);
  _redis.on('error', () => {});
  return _redis;
}

async function setUserRateLimit(userId, ttlSec = DEFAULT_TTL_SEC) {
  const redis = getRedis();
  if (!redis || !userId) return false;
  const key = KEY_PREFIX + String(userId);
  await redis.setex(key, ttlSec, '1');
  return true;
}

async function isUserRateLimited(userId) {
  const redis = getRedis();
  if (!redis || !userId) return false;
  const key = KEY_PREFIX + String(userId);
  const val = await redis.get(key);
  return val === '1';
}

module.exports = { getRedis, setUserRateLimit, isUserRateLimited, KEY_PREFIX };
