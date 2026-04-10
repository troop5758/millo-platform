'use strict';
/**
 * Admin trust dashboard — Redis snapshot `risk:{userId}` + Mongo TrustEdge graph (from user).
 * https://milloapp.com
 */
const db = require('@millo/database');

const RISK_KEY_PREFIX = 'risk:';

function hasRedisConfigured() {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * @param {string} userId
 * @returns {Promise<null|string|object>} — JSON-parsed object if value is valid JSON, else raw string
 */
async function getRedisRiskPayload(userId) {
  if (!hasRedisConfigured()) return null;
  try {
    const { getRedis } = require('../lib/rateLimitRedisStore');
    const raw = await getRedis().get(`${RISK_KEY_PREFIX}${String(userId)}`);
    if (raw == null || raw === '') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

/**
 * Outgoing trust/risk edges for graph visualization.
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 */
async function getTrustEdgesFromUser(userId, opts = {}) {
  if (!userId) return [];
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 200));
  return db.TrustEdge.find({ from: userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * @param {string} userId
 */
async function getAdminTrustRiskView(userId) {
  const [risk, graph] = await Promise.all([
    getRedisRiskPayload(userId),
    getTrustEdgesFromUser(userId),
  ]);
  return { risk, graph };
}

module.exports = {
  getRedisRiskPayload,
  getTrustEdgesFromUser,
  getAdminTrustRiskView,
  RISK_KEY_PREFIX,
};
