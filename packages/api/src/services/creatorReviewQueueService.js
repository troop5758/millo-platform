'use strict';
/**
 * Creator Review Queue — manual review queue for suspicious creators.
 * Admin actions: approve payout, disable monetization, temporary suspension, permanent ban.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { writeAdminAuditLog } = require('./auditLog');

/**
 * Add a creator to the review queue (or update risk if already pending).
 */
async function addToQueue(creatorId, riskScore, reason, meta = {}) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return null;
  const existing = await db.CreatorReviewQueue.findOne({ creatorId: cid, status: { $in: ['pending', 'in_review'] } }).lean();
  if (existing) {
    await db.CreatorReviewQueue.updateOne(
      { _id: existing._id },
      { $set: { riskScore: Number(riskScore), reason: String(reason).slice(0, 500), meta: { ...(existing.meta || {}), ...meta }, updatedAt: new Date() } }
    );
    return existing._id;
  }
  const doc = await db.CreatorReviewQueue.create({
    creatorId: cid,
    riskScore: Math.max(0, Math.min(100, Number(riskScore))),
    reason: String(reason).slice(0, 500),
    status: 'pending',
    meta: meta && typeof meta === 'object' ? meta : {},
  }).catch(() => null);
  return doc?._id ?? null;
}

/**
 * List queue items. Optional filter by status (pending, in_review, resolved).
 */
async function getQueue(status = null, limit = 100) {
  const query = status ? { status } : {};
  const items = await db.CreatorReviewQueue.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .populate('creatorId', 'email')
    .populate('assignedModerator', 'email')
    .populate('resolvedBy', 'email')
    .lean();
  return items;
}

/**
 * Get a single queue item by id.
 */
async function getById(id) {
  if (!id) return null;
  return db.CreatorReviewQueue.findById(id)
    .populate('creatorId', 'email status creatorStatus shadowBanned flags')
    .populate('assignedModerator', 'email')
    .populate('resolvedBy', 'email')
    .lean();
}

/**
 * Assign a moderator to a queue item.
 */
async function assignModerator(queueId, moderatorId) {
  const item = await db.CreatorReviewQueue.findOne({ _id: queueId, status: { $in: ['pending', 'in_review'] } });
  if (!item) return { ok: false, error: 'NOT_FOUND_OR_RESOLVED' };
  item.assignedModerator = moderatorId;
  item.status = 'in_review';
  await item.save();
  return { ok: true, item: item.toObject() };
}

/**
 * Resolve queue item with an admin action. Performs the action and marks item resolved.
 * Actions: approve_payout | disable_monetization | temporary_suspension | permanent_ban
 */
async function resolve(queueId, action, adminId, note = '') {
  const item = await db.CreatorReviewQueue.findOne({ _id: queueId, status: { $in: ['pending', 'in_review'] } });
  if (!item) return { ok: false, error: 'NOT_FOUND_OR_RESOLVED' };
  const creatorId = item.creatorId;
  const cid = creatorId?.toString?.() || creatorId;

  switch (action) {
    case 'approve_payout':
      // Clear payout holds for this creator so they can withdraw (optional: approve pending payout)
      const fraudService = require('./fraudService');
      const holdCount = await db.PayoutHold.countDocuments({ creatorId: cid, holdUntil: { $gt: new Date() } });
      if (holdCount > 0) {
        await db.PayoutHold.deleteMany({ creatorId: cid }).catch(() => {});
      }
      break;
    case 'disable_monetization':
      await db.User.updateOne(
        { _id: cid },
        { $set: { 'flags.monetizationDisabled': true } }
      ).catch(() => {});
      break;
    case 'temporary_suspension':
      await db.User.updateOne(
        { _id: cid },
        { $set: { status: 'suspended', suspensionReason: (note || 'Monetization risk review: temporary suspension').slice(0, 500) } }
      ).catch(() => {});
      break;
    case 'permanent_ban':
      await db.User.updateOne(
        { _id: cid },
        { $set: { status: 'banned', suspensionReason: (note || 'Monetization risk review: permanent ban').slice(0, 500) } }
      ).catch(() => {});
      break;
    default:
      return { ok: false, error: 'INVALID_ACTION', valid: ['approve_payout', 'disable_monetization', 'temporary_suspension', 'permanent_ban'] };
  }

  item.status = 'resolved';
  item.resolution = action;
  item.resolvedBy = adminId;
  item.resolvedAt = new Date();
  item.resolutionNote = String(note).slice(0, 1000);
  await item.save();

  try {
    await writeAdminAuditLog({
      adminId,
      action: 'creator_review_queue_resolve',
      targetType: 'CreatorReviewQueue',
      targetId: item._id.toString(),
      meta: { creatorId: cid, resolution: action, note: item.resolutionNote },
    });
  } catch (_) {}

  return { ok: true, item: item.toObject() };
}

module.exports = {
  addToQueue,
  getQueue,
  getById,
  assignModerator,
  resolve,
};
