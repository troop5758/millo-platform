'use strict';
/**
 * Redis + BullMQ — shared connection surface for the API.
 *
 * - `redis` is the same ioredis singleton as rate limiting / locks (`rateLimitRedisStore.getRedis`).
 * - `videoQueue` is a lazy BullMQ queue named `video-processing` (add workers separately).
 *
 * Env: REDIS_URL or REDIS_URI (preferred for BullMQ), or REDIS_HOST + REDIS_PORT (+ REDIS_PASSWORD).
 * https://milloapp.com
 */
const { getRedis } = require('./rateLimitRedisStore');
const { Queue } = require('bullmq');

/** BullMQ / ioredis-style connection (URL or host cluster). */
function getBullMqConnection() {
  const url = (process.env.REDIS_URL || process.env.REDIS_URI || '').trim();
  if (url) return { url };
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

const redis = getRedis();

let _videoQueue = null;
function getVideoQueue() {
  if (!_videoQueue) {
    _videoQueue = new Queue('video-processing', {
      connection: getBullMqConnection(),
    });
  }
  return _videoQueue;
}

module.exports = {
  redis,
  getRedis,
  getBullMqConnection,
  getVideoQueue,
};

Object.defineProperty(module.exports, 'videoQueue', {
  enumerable: true,
  configurable: true,
  get() {
    return getVideoQueue();
  },
});
