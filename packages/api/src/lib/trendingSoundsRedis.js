'use strict';
/**
 * Trending Sound Leaderboard — Redis ZSET trending_sounds.
 * Score: viral_score. Updated every 5 minutes by trending sounds worker.
 * APIs: GET /music/trending, GET /sounds/trending.
 * https://milloapp.com
 */
const TRENDING_KEY = 'trending_sounds';
const TRENDING_SOUNDS_ZSET = TRENDING_KEY;
const VIRAL_CANDIDATES_KEY = 'viral_sound_candidates';

/** Geographic trend boost: per-region leaderboard keys (e.g. trending_sounds_us, trending_sounds_brazil). */
const TRENDING_REGION_PREFIX = 'trending_sounds_';
const TRENDING_REGIONS = [
  { code: 'US', slug: 'us' },
  { code: 'BR', slug: 'brazil' },
  { code: 'IN', slug: 'india' },
  { code: 'UK', slug: 'uk' },
  { code: 'EU', slug: 'eu' },
];
function toRegionSlug(region) {
  const s = (region || '').toString().toLowerCase().trim();
  const bySlug = TRENDING_REGIONS.find((r) => r.slug === s);
  if (bySlug) return bySlug.slug;
  const byCode = TRENDING_REGIONS.find((r) => r.code.toLowerCase() === s);
  return byCode ? byCode.slug : null;
}

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

/**
 * Get trending sound IDs in order (highest viral score first).
 * @param {number} limit
 * @returns {Promise<string[]>} soundIds (Mongo ObjectId strings)
 */
async function getTrendingSoundIds(limit = 20) {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const ids = await redis.zrevrange(TRENDING_KEY, 0, limit - 1);
    return ids || [];
  } catch {
    return [];
  }
}

/**
 * Get viral score for one sound (for discovery boost). Returns 0 if not in leaderboard.
 * @param {string} soundId
 * @returns {Promise<number>}
 */
async function getSoundViralScore(soundId) {
  const redis = getRedis();
  if (!redis || !soundId) return 0;
  try {
    const score = await redis.zscore(TRENDING_KEY, String(soundId));
    return score != null ? Number(score) : 0;
  } catch {
    return 0;
  }
}

/**
 * Get viral scores for multiple sounds (batch for feed ranking).
 * @param {string[]} soundIds
 * @returns {Promise<Record<string, number>>} map of soundId -> score
 */
async function getSoundViralScoresMap(soundIds) {
  const redis = getRedis();
  const out = Object.fromEntries((soundIds || []).map((id) => [String(id), 0]));
  if (!redis || !soundIds?.length) return out;
  try {
    const pipeline = redis.pipeline();
    for (const id of soundIds) pipeline.zscore(TRENDING_KEY, String(id));
    const results = await pipeline.exec();
    (results || []).forEach(([err, score], i) => {
      if (!err && soundIds[i] != null) out[String(soundIds[i])] = score != null ? Number(score) : 0;
    });
    return out;
  } catch {
    return out;
  }
}

/**
 * Get sound IDs in the early-viral candidate pool (sounds that exceeded early detection threshold).
 * @param {number} limit
 * @returns {Promise<string[]>} soundIds (Mongo ObjectId strings), highest early score first
 */
async function getViralCandidateIds(limit = 20) {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const ids = await redis.zrevrange(VIRAL_CANDIDATES_KEY, 0, limit - 1);
    return ids || [];
  } catch {
    return [];
  }
}

const CLUSTERS = ['dance', 'comedy', 'fitness', 'beauty', 'gaming', 'general'];
const CLUSTER_TRENDING_PREFIX = 'cluster:trending:';
const CLUSTER_TEST_PREFIX = 'cluster:test:';

function toCluster(c) {
  const s = (c || 'general').toString().toLowerCase().trim();
  return CLUSTERS.includes(s) ? s : 'general';
}

async function getTrendingSoundIdsForCluster(cluster, limit = 20) {
  const redis = getRedis();
  if (!redis) return [];
  const key = `${CLUSTER_TRENDING_PREFIX}${toCluster(cluster)}`;
  try {
    const ids = await redis.zrevrange(key, 0, limit - 1);
    return ids || [];
  } catch {
    return [];
  }
}

async function getTestSoundIdsForCluster(cluster, limit = 10) {
  const redis = getRedis();
  if (!redis) return [];
  const key = `${CLUSTER_TEST_PREFIX}${toCluster(cluster)}`;
  try {
    const ids = await redis.smembers(key);
    return (ids || []).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Get trending sound IDs for a region (e.g. us, brazil, india). Regional popularity can become global trends.
 * Falls back to global leaderboard if regional key is empty.
 * @param {string} region - Region slug (us, brazil, india) or code (US, BR, IN)
 * @param {number} limit
 * @returns {Promise<string[]>} soundIds
 */
async function getTrendingSoundIdsForRegion(region, limit = 20) {
  const redis = getRedis();
  if (!redis) return [];
  const slug = toRegionSlug(region);
  if (!slug) return [];
  const key = `${TRENDING_REGION_PREFIX}${slug}`;
  try {
    const ids = await redis.zrevrange(key, 0, limit - 1);
    if (ids && ids.length > 0) return ids;
    return getTrendingSoundIds(limit);
  } catch {
    return getTrendingSoundIds(limit);
  }
}

module.exports = {
  getTrendingSoundIds,
  getSoundViralScore,
  getSoundViralScoresMap,
  getViralCandidateIds,
  getTrendingSoundIdsForCluster,
  getTestSoundIdsForCluster,
  getTrendingSoundIdsForRegion,
  toRegionSlug,
  TRENDING_REGIONS,
  TRENDING_REGION_PREFIX,
  CLUSTERS,
  toCluster,
  TRENDING_KEY,
  TRENDING_SOUNDS_ZSET,
  VIRAL_CANDIDATES_KEY,
  getRedis,
};
