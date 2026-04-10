'use strict';
/**
 * Redis key for "require CAPTCHA for user" — set by bot detection worker, read by auth/gift routes.
 * https://milloapp.com
 */
const Redis = require('ioredis');

const KEY_PREFIX = 'require_captcha:';
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

async function setRequireCaptcha(userId, ttlSec = DEFAULT_TTL_SEC) {
  const redis = getRedis();
  if (!redis || !userId) return false;
  const key = KEY_PREFIX + String(userId);
  await redis.setex(key, ttlSec, '1');
  return true;
}

async function isRequireCaptcha(userId) {
  const redis = getRedis();
  if (!redis || !userId) return false;
  const key = KEY_PREFIX + String(userId);
  const val = await redis.get(key);
  return val === '1';
}

module.exports = { getRedis, setRequireCaptcha, isRequireCaptcha, KEY_PREFIX };
