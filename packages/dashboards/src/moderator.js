/**
 * Moderator dashboard — live moderation, abuse queue, abuse review, appeals.
 * Overrides logged to AdminAuditLog. https://milloapp.com
 */
const db = require('@millo/database');
const { writeAdminAuditLog } = db;
const live = require('@millo/live');
const levelTrust = require('@millo/level-trust');
const roles = require('./roles');

async function liveModeration(modUser, streamId, action, meta = {}) {
  roles.requireMod(modUser);
  const modId = modUser._id || modUser;
  await live.moderateStream(streamId, modId, action, meta);
  await writeAdminAuditLog({
    action: 'live_moderation',
    adminId: modId,
    targetType: 'LiveStream',
    targetId: String(streamId),
    overrideReason: meta.reason || null,
    meta: { moderationAction: action },
  });
  return { ok: true };
}

async function abuseQueue(modUser, status, limit = 50) {
  roles.requireMod(modUser);
  const filter = status ? { status } : {};
  const reports = await db.Report.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return reports;
}

async function appealList(modUser, status, limit = 50) {
  roles.requireMod(modUser);
  const filter = status ? { status } : {};
  const appeals = await db.Appeal.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return appeals;
}

async function resolveAppeal(modUser, appealId, decision, reason) {
  roles.requireMod(modUser);
  if (!['upheld', 'overturned'].includes(decision)) throw new Error('INVALID_DECISION');
  const modId = modUser._id || modUser;
  const appeal = await db.Appeal.findById(appealId);
  if (!appeal || appeal.status !== 'pending') throw new Error('APPEAL_NOT_PENDING');
  appeal.status = decision;
  appeal.decidedBy = modId;
  appeal.decidedAt = new Date();
  await appeal.save();
  await writeAdminAuditLog({
    action: 'appeal_resolve',
    adminId: modId,
    targetType: 'Appeal',
    targetId: appealId.toString(),
    overrideReason: reason || null,
    meta: { decision },
  });
  return appeal.toObject();
}

/**
 * Abuse review — resolve report: dismiss or apply penalty (Phase 3 applyAbusePenalty).
 * When action is apply_penalty and targetType is User, calls levelTrust.applyAbusePenalty(targetId, reason).
 */
async function abuseReview(modUser, reportId, action, meta = {}) {
  roles.requireMod(modUser);
  if (!['dismiss', 'apply_penalty'].includes(action)) throw new Error('INVALID_ABUSE_ACTION');
  const modId = modUser._id || modUser;
  const report = await db.Report.findById(reportId);
  if (!report || report.status !== 'pending') throw new Error('REPORT_NOT_PENDING');
  const reason = meta.reason || 'abuse_review';
  if (action === 'apply_penalty' && report.targetType === 'User' && report.targetId) {
    await levelTrust.applyAbusePenalty(report.targetId, reason);
  }
  report.status = action === 'dismiss' ? 'resolved' : 'reviewed';
  await report.save();
  await writeAdminAuditLog({
    action: 'abuse_review',
    adminId: modId,
    targetType: 'Report',
    targetId: reportId.toString(),
    overrideReason: meta.reason || null,
    meta: { decision: action, targetType: report.targetType, targetId: report.targetId },
  });
  return report.toObject();
}

/**
 * Set shadow-ban on a creator. Writes Moderation (reason, expiresAt) and syncs User/Profile.
 * Body: { userId, shadowBanned, reason?, expiresAt? }
 */
async function setShadowBan(modUser, userId, shadowBanned, reason, expiresAt) {
  roles.requireMod(modUser);
  const modId = modUser._id || modUser;
  const value = !!shadowBanned;
  await db.Moderation.findOneAndUpdate(
    { userId },
    {
      $set: {
        shadowBanned: value,
        reason: reason != null ? String(reason).slice(0, 500) : '',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        setAt: new Date(),
        setBy: modId,
      },
    },
    { upsert: true, new: true }
  );
  const profile = await db.Profile.findOneAndUpdate(
    { userId },
    { $set: { shadowBanned: value } },
    { new: true, upsert: true }
  );
  await db.User.updateOne({ _id: userId }, { $set: { shadowBanned: value } }).catch(() => {});
  await writeAdminAuditLog({
    action:  'shadow_ban',
    adminId: modId,
    targetType: 'Profile',
    targetId: String(profile?._id || userId),
    overrideReason: reason || null,
    meta: { userId: String(userId), shadowBanned: value, expiresAt: expiresAt || null },
  });
  return { ok: true, shadowBanned: value };
}

module.exports = { liveModeration, abuseQueue, appealList, resolveAppeal, abuseReview, setShadowBan };
