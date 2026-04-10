'use strict';
/**
 * Real-time personalization — optional Redis cache for personalized feed JSON responses.
 * Pattern: `redis.set(key, JSON.stringify(feed))` / `redis.get(key)` with short TTL.
 *
 * Keys are scoped beyond `feed:${userId}` so Explore vs For You, pagination, session boosts,
 * A/B bucket, and block list do not collide (see `redisKey`).
 *
 * Env: FEED_REDIS_CACHE_ENABLED=true, FEED_REDIS_CACHE_TTL_SEC (default 20, max 300).
 * https://milloapp.com
 */

const crypto = require('crypto');
const { getRedis } = require('../lib/rateLimitRedisStore');
const { recordRedisCacheHit, recordRedisCacheMiss } = require('../routes/metrics');

function isFeedPersonalizationCacheEnabled() {
  return process.env.FEED_REDIS_CACHE_ENABLED === 'true';
}

function feedCacheTtlSec() {
  const n = Number(process.env.FEED_REDIS_CACHE_TTL_SEC);
  if (Number.isFinite(n) && n > 0 && n <= 300) return Math.floor(n);
  return 20;
}

function hashShort(input, len = 16) {
  return crypto.createHash('sha256').update(String(input ?? '')).digest('base64url').slice(0, len);
}

/**
 * Canonical Redis key: `feed:${userId}:${scope}` — `feed:${userId}` is the prefix from product spec.
 * @param {string} userId
 * @param {string} scopeSuffix
 */
function feedRedisKey(userId, scopeSuffix) {
  const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const suf = String(scopeSuffix).replace(/[^a-zA-Z0-9_:.-]/g, '_').slice(0, 220);
  return `feed:${uid}:${suf}`;
}

/**
 * @param {object} p
 * @param {string} p.feedKind
 * @param {number} p.limit
 * @param {number} p.offset
 * @param {unknown[]} [p.sessionEvents]
 * @param {string} [p.experimentBucket]
 * @param {string[]} [p.blockedCreatorIds]
 */
function buildDiscoveryScope(p) {
  const fk = String(p.feedKind || 'for_you').slice(0, 24);
  const se = hashShort(JSON.stringify(Array.isArray(p.sessionEvents) ? p.sessionEvents : []));
  const exp = hashShort(String(p.experimentBucket || ''), 12);
  const bl = hashShort((p.blockedCreatorIds || []).map(String).sort().join(','), 12);
  return `${fk}:l${p.limit}:o${p.offset}:se${se}:exp${exp}:bl${bl}`;
}

/**
 * @param {object} p
 * @param {number} p.limit
 * @param {number} p.offset
 * @param {string[]} [p.blockedCreatorIds]
 */
function buildFollowingScope(p) {
  const bl = hashShort((p.blockedCreatorIds || []).map(String).sort().join(','), 12);
  return `following:l${p.limit}:o${p.offset}:bl${bl}`;
}

/**
 * @param {object} p
 * @param {number} p.limit
 * @param {boolean} p.contentCandidates
 * @param {string[]} [p.blockedCreatorIds]
 */
function buildRealtimeScope(p) {
  const bl = hashShort((p.blockedCreatorIds || []).map(String).sort().join(','), 12);
  const cc = p.contentCandidates ? '1' : '0';
  return `realtime:l${p.limit}:cc${cc}:bl${bl}`;
}

/**
 * @param {string} userId
 * @param {string} scopeSuffix
 * @returns {Promise<object|null>}
 */
async function getCachedFeedPayload(userId, scopeSuffix) {
  if (!isFeedPersonalizationCacheEnabled()) return null;
  const r = getRedis();
  if (!r) return null;
  const key = feedRedisKey(userId, scopeSuffix);
  try {
    const raw = await r.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} userId
 * @param {string} scopeSuffix
 * @param {object} payload — JSON-serializable response body
 */
async function setCachedFeedPayload(userId, scopeSuffix, payload) {
  if (!isFeedPersonalizationCacheEnabled()) return;
  const r = getRedis();
  if (!r) return;
  const key = feedRedisKey(userId, scopeSuffix);
  try {
    await r.set(key, JSON.stringify(payload), 'EX', feedCacheTtlSec());
  } catch {
    /* non-fatal */
  }
}

function recordFeedCacheHit() {
  try {
    recordRedisCacheHit('feed_personalized');
  } catch {
    /* ignore */
  }
}

function recordFeedCacheMiss() {
  try {
    recordRedisCacheMiss('feed_personalized');
  } catch {
    /* ignore */
  }
}

module.exports = {
  isFeedPersonalizationCacheEnabled,
  feedCacheTtlSec,
  feedRedisKey,
  buildDiscoveryScope,
  buildFollowingScope,
  buildRealtimeScope,
  getCachedFeedPayload,
  setCachedFeedPayload,
  recordFeedCacheHit,
  recordFeedCacheMiss,
};
