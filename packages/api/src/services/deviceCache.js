'use strict';
/**
 * Redis cache for device registration lookups — fast reads for `(userId, client device hint)`.
 * Keys are `millo:device:{userId}:{deviceId}` so two accounts sharing a client hint never collide.
 * Writes fail soft if Redis is down. Env: DEVICE_CACHE_TTL_SEC (default 3600).
 * https://milloapp.com
 */
const { redis } = require('../lib/redis');

const PREFIX = 'millo:device:';
const TTL_SEC = Math.max(60, Number(process.env.DEVICE_CACHE_TTL_SEC) || 3600);

function cacheKey(userId, deviceId) {
  const u = userId != null ? String(userId) : '';
  const d = deviceId != null ? String(deviceId).slice(0, 256) : '';
  return `${PREFIX}${u}:${d}`;
}

function normalizeForJson(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}

/**
 * @param {{ userId: string, deviceId: string, fingerprint?: string, visitorId?: string, lastSeenAt?: Date|string, firstSeenAt?: Date|string, [k: string]: unknown }} device - must include userId + deviceId (client hint)
 */
async function cacheDevice(device) {
  if (!device || device.userId == null || device.deviceId == null) return;
  const key = cacheKey(device.userId, device.deviceId);
  try {
    await redis.set(key, JSON.stringify(normalizeForJson(device)), 'EX', TTL_SEC);
  } catch (_) {
    /* optional cache */
  }
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string} deviceId - same client hint used for cacheDevice
 * @returns {Promise<object|null>}
 */
async function getCachedDevice(userId, deviceId) {
  if (userId == null || deviceId == null) return null;
  try {
    const data = await redis.get(cacheKey(userId, deviceId));
    return data ? JSON.parse(data) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string} deviceId
 */
async function invalidateDeviceCache(userId, deviceId) {
  if (userId == null || deviceId == null) return;
  try {
    await redis.del(cacheKey(userId, deviceId));
  } catch (_) {
    /* optional */
  }
}

module.exports = {
  cacheDevice,
  getCachedDevice,
  invalidateDeviceCache,
  cacheKey,
  DEVICE_CACHE_TTL_SEC: TTL_SEC,
};
