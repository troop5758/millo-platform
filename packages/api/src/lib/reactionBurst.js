'use strict';
/**
 * TikTok-style emoji burst — aggregate reactions and broadcast burst events.
 * When many viewers react, server sends aggregated burst instead of individual events.
 * Key: live:reaction_burst_sent:{streamId} = hash { emoji: lastSentCount }
 * https://milloapp.com
 */
const reactionCounters = require('./reactionCounters');

const SENT_KEY_PREFIX = 'live:reaction_burst_sent:';
const ACTIVE_KEY = 'live:reaction_burst_active';
const TTL_SECONDS = 24 * 60 * 60;
const BURST_INTERVAL_MS = Number(process.env.REACTION_BURST_INTERVAL_MS) || 1500;

let _redis = null;
let _intervalId = null;

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

/**
 * Mark stream as having recent reaction activity.
 */
async function markActive(streamId) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.sadd(ACTIVE_KEY, String(streamId));
    await redis.expire(ACTIVE_KEY, TTL_SECONDS);
  } catch {}
}

/**
 * Get deltas (new reactions since last burst) and update last-sent counts.
 * @returns {Promise<Record<string, number>>} { emoji: delta }
 */
async function getDeltasAndUpdate(streamId) {
  const redis = getRedis();
  if (!redis) return {};
  const sid = String(streamId);
  try {
    const [current, lastSent] = await Promise.all([
      reactionCounters.getCounts(streamId),
      redis.hgetall(SENT_KEY_PREFIX + sid).catch(() => ({})),
    ]);
    const deltas = {};
    const toSet = {};
    for (const [emoji, count] of Object.entries(current || {})) {
      const prev = parseInt(lastSent?.[emoji] || '0', 10) || 0;
      const cur = parseInt(count, 10) || 0;
      const delta = Math.max(0, cur - prev);
      if (delta > 0) {
        deltas[emoji] = delta;
        toSet[emoji] = String(cur);
      }
    }
    if (Object.keys(toSet).length > 0) {
      await redis.hset(SENT_KEY_PREFIX + sid, toSet);
      await redis.expire(SENT_KEY_PREFIX + sid, TTL_SECONDS);
    }
    return deltas;
  } catch {
    return {};
  }
}

/**
 * Process all active streams and broadcast reaction_burst for each emoji with new count.
 * @param {function(streamId: string, payload: object): void} broadcastFn
 */
async function processBursts(broadcastFn) {
  const redis = getRedis();
  if (!redis || !broadcastFn) return;
  try {
    const streamIds = await redis.smembers(ACTIVE_KEY);
    for (const streamId of streamIds || []) {
      const deltas = await getDeltasAndUpdate(streamId);
      for (const [emoji, count] of Object.entries(deltas)) {
        if (count > 0) {
          broadcastFn(streamId, {
            type: 'reaction_burst',
            emoji,
            count,
            streamId,
            timestamp: Date.now(),
          });
        }
      }
    }
  } catch {}
}

/**
 * Start the periodic burst processor.
 * @param {function(streamId: string, payload: object): void} broadcastFn
 */
function startBurstInterval(broadcastFn) {
  if (_intervalId) return;
  _intervalId = setInterval(() => {
    processBursts(broadcastFn).catch(() => {});
  }, BURST_INTERVAL_MS);
}

function stopBurstInterval() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = {
  markActive,
  getDeltasAndUpdate,
  processBursts,
  startBurstInterval,
  stopBurstInterval,
  BURST_INTERVAL_MS,
};
