'use strict';
/**
 * Trust score history — snapshot and query for admin timeline.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * Append a trust score snapshot to history.
 * @param {string|ObjectId} userId
 * @param {number} score - 0–100
 * @param {object} [factors] - factor breakdown
 */
async function snapshot(userId, score, factors = {}) {
  if (userId == null) return;
  const uid = userId.toString?.() || userId;
  await db.TrustHistory.create({
    userId: uid,
    trustScore: Math.max(0, Math.min(100, Number(score))),
    factors: factors && typeof factors === 'object' ? factors : {},
  }).catch(() => {});
}

/**
 * Get history for admin timeline: [{ date, score }, ...] newest first (or oldest first for chart).
 * @param {string|ObjectId} userId
 * @param {{ limit?: number, order?: 1 | -1 }} [opts] - limit default 90, order 1 = ascending (oldest first for chart)
 */
async function getHistory(userId, opts = {}) {
  if (userId == null) return [];
  const uid = userId.toString?.() || userId;
  const limit = Math.min(500, opts.limit ?? 90);
  const order = opts.order === 1 ? 1 : -1;
  const docs = await db.TrustHistory.find({ userId: uid })
    .sort({ createdAt: order })
    .limit(limit)
    .select('trustScore createdAt')
    .lean();
  return docs.map((d) => ({
    date: d.createdAt,
    score: d.trustScore,
  }));
}

module.exports = { snapshot, getHistory };
