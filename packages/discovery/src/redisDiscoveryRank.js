'use strict';
/**
 * Attach Kafka-driven discovery scores from Redis (MGET discovery:rank:score:*).
 * Requires REDIS_URL or REDIS_HOST and optional ioredis.
 * https://milloapp.com
 */
const SCORE_PREFIX = 'discovery:rank:score:';

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
    const url = process.env.REDIS_URL;
    if (url) {
      _redis = new Redis(url);
      _redis.on('error', () => {});
      return _redis;
    }
    if (process.env.REDIS_HOST) {
      _redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      });
      _redis.on('error', () => {});
      return _redis;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {Array<{ id?: unknown, _id?: unknown }>} items
 */
async function attachKafkaDiscoveryRankScores(items) {
  const r = getRedis();
  if (!r || !items?.length) return;
  const ids = items.map((i) => String(i.id ?? i._id ?? '')).filter(Boolean);
  if (!ids.length) return;
  const keys = ids.map((id) => `${SCORE_PREFIX}${id}`);
  let vals;
  try {
    vals = await r.mget(keys);
  } catch {
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const v = vals[i];
    if (v != null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) items[i].discoveryRedisRankScore = n;
    }
  }
}

module.exports = { attachKafkaDiscoveryRankScores, getRedis };
