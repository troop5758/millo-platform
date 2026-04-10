'use strict';
/**
 * Chargeback service — list, get, and handle Stripe disputes/chargebacks.
 * Webhook records Chargeback; this module provides admin APIs and optional reversal logic.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * List chargebacks with optional filters.
 * @param {Object} opts - { status, userId, limit, offset }
 * @returns {Object} { chargebacks, total }
 */
async function listChargebacks(opts = {}) {
  const { status, userId, limit = 50, offset = 0 } = opts;
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.userId = userId;

  const [chargebacks, total] = await Promise.all([
    db.Chargeback.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(Number(limit), 100))
      .lean(),
    db.Chargeback.countDocuments(filter),
  ]);

  return { chargebacks, total, limit: Number(limit), offset: Number(offset) };
}

/**
 * Get a single chargeback by ID.
 * @param {string} id - Chargeback _id or stripeDisputeId
 * @returns {Object|null} Chargeback document or null
 */
async function getChargebackById(id) {
  if (!id) return null;
  const byId = await db.Chargeback.findById(id).lean();
  if (byId) return byId;
  return db.Chargeback.findOne({ stripeDisputeId: id }).lean();
}

/**
 * Get chargeback summary (counts by status, total amount).
 * @returns {Object} { byStatus, totalOpenCents, totalLostCents }
 */
async function getChargebackSummary() {
  const byStatus = await db.Chargeback.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, totalCents: { $sum: '$amountCents' } } },
    { $sort: { _id: 1 } },
  ]);
  const open = await db.Chargeback.aggregate([
    { $match: { status: 'open' } },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  const lost = await db.Chargeback.aggregate([
    { $match: { status: 'lost' } },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  return {
    byStatus: byStatus.reduce((acc, r) => {
      acc[r._id] = { count: r.count, totalCents: r.totalCents };
      return acc;
    }, {}),
    totalOpenCents: open[0]?.total ?? 0,
    totalLostCents: lost[0]?.total ?? 0,
  };
}

/**
 * Get users with multiple chargebacks (high-risk).
 * @param {number} minChargebacks - minimum chargebacks to flag (default 2)
 * @returns {Object[]} { userId, chargebackCount, totalCents }
 */
async function getHighRiskUsers(minChargebacks = 2) {
  const agg = await db.Chargeback.aggregate([
    { $match: { userId: { $ne: null } } },
    { $group: { _id: '$userId', count: { $sum: 1 }, totalCents: { $sum: '$amountCents' } } },
    { $match: { count: { $gte: minChargebacks } } },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ]);
  return agg.map((r) => ({
    userId: r._id,
    chargebackCount: r.count,
    totalCents: r.totalCents,
  }));
}

/**
 * Add admin note to a chargeback.
 * @param {string} id - Chargeback _id or stripeDisputeId
 * @param {string} adminId - Admin user _id
 * @param {string} note - Admin note text
 */
async function addAdminNote(id, adminId, note) {
  const cb = await db.Chargeback.findOne({ $or: [{ _id: id }, { stripeDisputeId: id }] });
  if (!cb) return null;
  cb.meta = cb.meta || {};
  cb.meta.adminNotes = cb.meta.adminNotes || [];
  cb.meta.adminNotes.push({
    adminId: adminId?.toString(),
    note: String(note || '').slice(0, 1000),
    at: new Date(),
  });
  await cb.save();
  return cb.toObject();
}

module.exports = { listChargebacks, getChargebackById, getChargebackSummary, getHighRiskUsers, addAdminNote };
