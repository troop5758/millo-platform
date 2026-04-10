'use strict';
/**
 * Creator Trust Timeline — snapshot and query CRS history for admin dashboard.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * Append a creator reputation score snapshot to history.
 * @param {string|ObjectId} creatorId
 * @param {number} score - 0–100 (CRS)
 * @param {string} [reason] - e.g. 'computed', 'scheduled', 'manual_refresh'
 */
async function snapshot(creatorId, score, reason = 'computed') {
  if (creatorId == null) return;
  const cid = creatorId.toString?.() || creatorId;
  await db.CreatorTrustHistory.create({
    creatorId: cid,
    score: Math.max(0, Math.min(100, Number(score))),
    reason: typeof reason === 'string' ? reason.trim().slice(0, 128) : 'computed',
    timestamp: new Date(),
  }).catch(() => {});
}

/**
 * Get history for admin timeline/chart: [{ date, score, reason }, ...].
 * @param {string|ObjectId} creatorId
 * @param {{ limit?: number, order?: 1 | -1 }} [opts] - limit default 90, order 1 = ascending (oldest first for chart)
 */
async function getHistory(creatorId, opts = {}) {
  if (creatorId == null) return [];
  const cid = creatorId.toString?.() || creatorId;
  const limit = Math.min(500, opts.limit ?? 90);
  const order = opts.order === 1 ? 1 : -1;
  const docs = await db.CreatorTrustHistory.find({ creatorId: cid })
    .sort({ timestamp: order })
    .limit(limit)
    .select('score reason timestamp')
    .lean();
  return docs.map((d) => ({
    date: d.timestamp ?? d.createdAt,
    score: d.score,
    reason: d.reason ?? 'computed',
  }));
}

module.exports = { snapshot, getHistory };
