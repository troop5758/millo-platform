'use strict';
/**
 * Candidate generation — multiple retrieval sources for the recommendation pipeline.
 * Uses ContentFeatures / UserProfileFeatures (@millo/database), optional Redis cache.
 * Follow list: Redis key `u:{userId}:follows` (JSON array of creator id strings) or Mongo Follow fallback.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { getRedis } = require('./redisDiscoveryRank');

function isLikelyObjectId(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

const TRENDING_CACHE_KEY = 'feed:trending:candidates';
const TRENDING_CACHE_TTL_SEC = 30;

function followsRedisKey(userId) {
  return `u:${String(userId)}:follows`;
}

/**
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function getFollowedCreatorIds(userId) {
  const uid = String(userId);
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(followsRedisKey(uid));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
      }
    } catch {
      /* fall through */
    }
  }
  if (!isLikelyObjectId(uid)) return [];
  const rows = await db.Follow.find({ followerId: uid }).select('followingId').lean();
  return rows.map((r) => String(r.followingId));
}

/**
 * @param {string} userId
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getFollowCandidates(userId, limit = 100) {
  const followedCreatorIds = await getFollowedCreatorIds(userId);
  if (!followedCreatorIds.length) return [];
  return db.ContentFeatures.find({
    creatorId: { $in: followedCreatorIds },
    moderationState: 'approved',
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getTrendingCandidates(limit = 100) {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(TRENDING_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {
      /* miss */
    }
  }
  const docs = await db.ContentFeatures.find({ moderationState: 'approved' })
    .sort({ ctr1h: -1, avgWatchTime1h: -1, shareRate24h: -1 })
    .limit(limit)
    .lean();
  if (redis && docs.length) {
    try {
      await redis.set(TRENDING_CACHE_KEY, JSON.stringify(docs), 'EX', TRENDING_CACHE_TTL_SEC);
    } catch {
      /* non-fatal */
    }
  }
  return docs;
}

/**
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getFreshExplorationCandidates(limit = 100) {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  return db.ContentFeatures.find({
    moderationState: 'approved',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * @param {object|null|undefined} userProfile lean doc
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getLanguageCandidates(userProfile, limit = 100) {
  const lang = userProfile?.language;
  if (!lang || typeof lang !== 'string') return [];
  return db.ContentFeatures.find({
    moderationState: 'approved',
    language: lang,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Placeholder until vector DB / ANN — topic overlap with category affinities.
 * @param {object|null|undefined} userProfile
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getEmbeddingCandidates(userProfile, limit = 200) {
  const topics = userProfile?.categoryAffinityTop;
  if (!Array.isArray(topics) || topics.length === 0) return [];
  return db.ContentFeatures.find({
    moderationState: 'approved',
    topics: { $in: topics },
  })
    .sort({ completionRate24h: -1, avgWatchTime24h: -1 })
    .limit(limit)
    .lean();
}

/**
 * Merge retrieval pools and dedupe by contentId.
 * @param {string} userId
 * @param {{ userProfile?: object|null }} [options] - Pass lean profile to skip a second DB read (e.g. feed.service).
 * @returns {Promise<object[]>}
 */
async function generateCandidates(userId, options = {}) {
  const uid = String(userId);
  const userProfile =
    options.userProfile !== undefined
      ? options.userProfile
      : await db.UserProfileFeatures.findOne({ userId: uid }).lean();

  const [follow, trending, fresh, language, embedding] = await Promise.all([
    getFollowCandidates(uid),
    getTrendingCandidates(),
    getFreshExplorationCandidates(),
    userProfile ? getLanguageCandidates(userProfile) : Promise.resolve([]),
    userProfile ? getEmbeddingCandidates(userProfile) : Promise.resolve([]),
  ]);

  const merged = [...follow, ...trending, ...fresh, ...language, ...embedding];
  const seen = new Set();
  return merged.filter((item) => {
    const id = item.contentId != null ? String(item.contentId) : '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = {
  generateCandidates,
  getFollowCandidates,
  getTrendingCandidates,
  getFreshExplorationCandidates,
  getLanguageCandidates,
  getEmbeddingCandidates,
  getFollowedCreatorIds,
  TRENDING_CACHE_KEY,
  followsRedisKey,
};
