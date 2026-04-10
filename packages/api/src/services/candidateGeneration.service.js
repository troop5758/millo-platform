'use strict';
/**
 * Candidate generation (critical path) — merge Following, Trending, new uploads, similar-user recall.
 * Delegates to `@millo/discovery` `candidateGenerator` (ContentFeatures-backed).
 * https://milloapp.com
 */

const { candidateGenerator } = require('@millo/discovery');
const db = require('@millo/database');

/**
 * @param {object} row — ContentFeatures lean
 * @returns {object} shape compatible with `ranking.service.scoreVideo` (`id`, `category`, `createdAt`)
 */
function toCandidateVideo(row) {
  if (!row || typeof row !== 'object') return row;
  const topics = Array.isArray(row.topics) ? row.topics : [];
  const category = topics[0] != null ? String(topics[0]) : row.language != null ? String(row.language) : 'general';
  return {
    ...row,
    id: String(row.contentId),
    category,
    createdAt: row.createdAt,
    creatorId: row.creatorId,
  };
}

/**
 * Trending pool (cached in Redis when configured).
 * @param {number} [limit]
 */
async function getTrending(limit = 100) {
  const rows = await candidateGenerator.getTrendingCandidates(limit);
  return rows.map(toCandidateVideo);
}

/**
 * New uploads — last 24h exploration pool.
 * @param {number} [limit]
 */
async function getRecent(limit = 100) {
  const rows = await candidateGenerator.getFreshExplorationCandidates(limit);
  return rows.map(toCandidateVideo);
}

/**
 * Content from creators the user follows.
 * @param {string} userId
 * @param {number} [limit]
 */
async function getFromFollowing(userId, limit = 100) {
  const rows = await candidateGenerator.getFollowCandidates(String(userId), limit);
  return rows.map(toCandidateVideo);
}

/**
 * Similar users / interests — topic overlap from `UserProfileFeatures.categoryAffinityTop` (Phase 1 ANN stand-in).
 * @param {string} userId
 * @param {number} [limit]
 */
async function getSimilarUsers(userId, limit = 200) {
  const profile = await db.UserProfileFeatures.findOne({ userId: String(userId) }).lean();
  const rows = await candidateGenerator.getEmbeddingCandidates(profile, limit);
  return rows.map(toCandidateVideo);
}

/**
 * Merge all sources and dedupe by `contentId` (order: trending → recent → following → similar).
 * @param {string} userId
 * @param {{ following?: number, trending?: number, recent?: number, similar?: number }} [limits]
 * @returns {Promise<object[]>}
 */
async function getCandidateVideos(userId, limits = {}) {
  const l = {
    following: Math.min(200, Math.max(1, limits.following ?? 80)),
    trending: Math.min(200, Math.max(1, limits.trending ?? 80)),
    recent: Math.min(200, Math.max(1, limits.recent ?? 80)),
    similar: Math.min(300, Math.max(1, limits.similar ?? 120)),
  };
  const uid = String(userId);
  const [trending, recent, following, similar] = await Promise.all([
    getTrending(l.trending),
    getRecent(l.recent),
    getFromFollowing(uid, l.following),
    getSimilarUsers(uid, l.similar),
  ]);

  const merged = [...trending, ...recent, ...following, ...similar];
  const seen = new Set();
  const out = [];
  for (const v of merged) {
    const id = v?.id != null ? String(v.id) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(v);
  }
  return out;
}

module.exports = {
  getTrending,
  getRecent,
  getFromFollowing,
  getSimilarUsers,
  getCandidateVideos,
  toCandidateVideo,
};
