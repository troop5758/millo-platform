'use strict';
/**
 * Central enforcement engine — BAN, SHADOW_BAN, THROTTLE (explicit actions).
 * Numeric risk → tier mapping lives in `riskEnforcementEngine.js` (BAN / RESTRICT / ALLOW).
 * https://milloapp.com
 */
const mongoose = require('mongoose');
const db = require('@millo/database');
const { writeAdminAuditLog, writeAuditLog } = require('./auditLog');

const SYSTEM_MODERATOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');

/** @readonly */
const ENFORCEMENT_ACTIONS = Object.freeze({
  BAN: 'BAN',
  SHADOW_BAN: 'SHADOW_BAN',
  THROTTLE: 'THROTTLE',
});

const DEFAULT_THROTTLE_MS = parseInt(process.env.ENFORCEMENT_THROTTLE_MS, 10) || 60 * 60 * 1000;

function toObjectId(userId) {
  if (userId == null || userId === '') throw new Error('USER_ID_REQUIRED');
  const s = String(userId);
  if (!mongoose.isValidObjectId(s)) throw new Error('INVALID_USER_ID');
  return new mongoose.Types.ObjectId(s);
}

/**
 * Permanent account ban (aligns with strike ban path in moderationService).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ reason?: string, performedBy?: import('mongoose').Types.ObjectId, adminId?: import('mongoose').Types.ObjectId }} [opts] — pass `adminId` for AdminAuditLog (admin overrides)
 */
async function banUser(userId, opts = {}) {
  const uid = toObjectId(userId);
  await db.User.updateOne(
    { _id: uid },
    { $set: { status: 'banned', creatorStatus: 'rejected', shadowBanned: false } }
  );
  await db.UserStrike.findOneAndUpdate(
    { userId: uid },
    { $set: { status: 'banned', lastStrikeAt: new Date() } }
  ).catch(() => {});
  await db.ModerationLog.create({
    moderatorId: opts.performedBy || SYSTEM_MODERATOR_ID,
    targetType: 'user',
    targetId: String(uid),
    action: 'enforcement_ban',
    meta: { source: 'enforcement_engine', reason: opts.reason || '' },
  }).catch(() => {});
  const reasonStr = (opts.reason != null ? String(opts.reason) : '').slice(0, 500) || 'POLICY';
  await writeAuditLog({
    action: 'USER_BANNED',
    userId: uid,
    adminId: opts.adminId || undefined,
    reason: reasonStr,
    actorId: opts.adminId || opts.performedBy || SYSTEM_MODERATOR_ID,
    resourceType: 'User',
    resourceId: String(uid),
    meta: { source: 'enforcement_engine' },
  });
  if (opts.adminId) {
    await writeAdminAuditLog({
      adminId: opts.adminId,
      action: 'ENFORCEMENT_BAN',
      targetType: 'User',
      targetId: String(uid),
      meta: { reason: opts.reason || '' },
    });
  }
}

/**
 * Shadow-ban — reduced reach (FYP, comments, live visibility per Phase 7).
 * Syncs Moderation doc + User + Profile (matches moderationService.isShadowBanned sources).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ reason?: string, expiresAt?: Date|null, performedBy?: import('mongoose').Types.ObjectId, adminId?: import('mongoose').Types.ObjectId }} [opts]
 */
async function reduceReach(userId, opts = {}) {
  const uid = toObjectId(userId);
  const reason = opts.reason != null ? String(opts.reason).slice(0, 500) : 'enforcement';
  const expiresAt = opts.expiresAt === undefined ? null : opts.expiresAt;
  const setBy = opts.performedBy || null;

  await db.Moderation.findOneAndUpdate(
    { userId: uid },
    {
      $set: {
        shadowBanned: true,
        reason,
        expiresAt,
        setAt: new Date(),
        setBy,
      },
    },
    { upsert: true }
  );
  await db.User.updateOne({ _id: uid }, { $set: { shadowBanned: true } });
  await db.Profile.updateOne({ userId: uid }, { $set: { shadowBanned: true } });
  await db.ModerationLog.create({
    moderatorId: opts.performedBy || SYSTEM_MODERATOR_ID,
    targetType: 'user',
    targetId: String(uid),
    action: 'enforcement_shadow_ban',
    meta: { source: 'enforcement_engine', reason, expiresAt: expiresAt ? expiresAt.toISOString() : null },
  }).catch(() => {});
  await writeAuditLog({
    action: 'USER_SHADOW_BANNED',
    userId: uid,
    adminId: opts.adminId || undefined,
    reason,
    actorId: opts.adminId || opts.performedBy || SYSTEM_MODERATOR_ID,
    resourceType: 'User',
    resourceId: String(uid),
    meta: { source: 'enforcement_engine', expiresAt: expiresAt ? expiresAt.toISOString() : null },
  });
  if (opts.adminId) {
    await writeAdminAuditLog({
      adminId: opts.adminId,
      action: 'ENFORCEMENT_SHADOW_BAN',
      targetType: 'User',
      targetId: String(uid),
      meta: { reason, expiresAt: expiresAt ? expiresAt.toISOString() : null },
    });
  }
}

/**
 * Rate-limit sensitive user actions until `flags.enforcementThrottleUntil`.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ durationMs?: number, performedBy?: import('mongoose').Types.ObjectId, reason?: string, adminId?: import('mongoose').Types.ObjectId }} [opts]
 */
async function limitActions(userId, opts = {}) {
  const uid = toObjectId(userId);
  const ms = Math.max(1000, Math.min(30 * 24 * 60 * 60 * 1000, Number(opts.durationMs) || DEFAULT_THROTTLE_MS));
  const until = new Date(Date.now() + ms);
  await db.User.updateOne(
    { _id: uid },
    { $set: { 'flags.enforcementThrottleUntil': until } }
  );
  await db.ModerationLog.create({
    moderatorId: opts.performedBy || SYSTEM_MODERATOR_ID,
    targetType: 'user',
    targetId: String(uid),
    action: 'enforcement_throttle',
    meta: {
      source: 'enforcement_engine',
      until: until.toISOString(),
      durationMs: ms,
      reason: opts.reason ? String(opts.reason).slice(0, 500) : '',
    },
  }).catch(() => {});
  const throttleReason = opts.reason ? String(opts.reason).slice(0, 500) : '';
  await writeAuditLog({
    action: 'USER_THROTTLED',
    userId: uid,
    adminId: opts.adminId || undefined,
    reason: throttleReason || 'THROTTLE',
    actorId: opts.adminId || opts.performedBy || SYSTEM_MODERATOR_ID,
    resourceType: 'User',
    resourceId: String(uid),
    meta: { source: 'enforcement_engine', until: until.toISOString(), durationMs: ms },
  });
  if (opts.adminId) {
    await writeAdminAuditLog({
      adminId: opts.adminId,
      action: 'ENFORCEMENT_THROTTLE',
      targetType: 'User',
      targetId: String(uid),
      meta: { until: until.toISOString(), durationMs: ms, reason: opts.reason || '' },
    });
  }
}

/**
 * @param {string|import('mongoose').Types.ObjectId|null|undefined} userId
 * @returns {Promise<boolean>}
 */
async function isActionThrottled(userId) {
  if (userId == null || userId === '') return false;
  let uid;
  try {
    uid = toObjectId(userId);
  } catch {
    return false;
  }
  const u = await db.User.findById(uid).select('flags').lean();
  const until = u?.flags?.enforcementThrottleUntil;
  if (!until) return false;
  return new Date(until) > new Date();
}

/**
 * @param {keyof typeof ENFORCEMENT_ACTIONS} action
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} [options] — passed to banUser / reduceReach / limitActions
 */
async function enforce(action, userId, options = {}) {
  switch (action) {
    case ENFORCEMENT_ACTIONS.BAN:
      await banUser(userId, options);
      break;
    case ENFORCEMENT_ACTIONS.SHADOW_BAN:
      await reduceReach(userId, options);
      break;
    case ENFORCEMENT_ACTIONS.THROTTLE:
      await limitActions(userId, options);
      break;
    default:
      throw new TypeError(`Unknown enforcement action: ${action}`);
  }
}

module.exports = {
  ENFORCEMENT_ACTIONS,
  enforce,
  banUser,
  reduceReach,
  limitActions,
  isActionThrottled,
  SYSTEM_MODERATOR_ID,
};
