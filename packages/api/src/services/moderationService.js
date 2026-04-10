'use strict';
/**
 * Phase 14 — Trust & Safety. Strike system, AI moderation stub, escalation, chat keyword filter.
 * https://milloapp.com
 */
const db = require('@millo/database');
const mongoose = require('mongoose');
const chatFilter = require('./moderation/chatFilter');

const SYSTEM_MODERATOR_ID = new mongoose.Types.ObjectId('000000000000000000000001');

const STRIKE_SUSPEND_THRESHOLD = 3;
const STRIKE_BAN_THRESHOLD = 5;
const SUSPEND_DAYS = 7;
const STRIKE_EXPIRY_DAYS = 90;

/**
 * Resolve report target to userId (the user who created the content).
 */
async function resolveTargetToUserId(targetType, targetId) {
  if (targetType === 'user') return targetId;
  if (targetType === 'stream') {
    const s = await db.LiveStream.findById(targetId).select('userId').lean();
    return s?.userId;
  }
  if (targetType === 'message') {
    const m = await db.DMMessage.findById(targetId).select('senderId').lean();
    return m?.senderId;
  }
  if (targetType === 'product') {
    const p = await db.Product.findById(targetId).select('creatorId').lean();
    return p?.creatorId;
  }
  if (targetType === 'comment') {
    const c = await db.StreamComment.findById(targetId).select('userId').lean();
    return c?.userId;
  }
  if (targetType === 'auction') {
    const a = await db.Auction.findById(targetId).select('creatorId').lean();
    return a?.creatorId;
  }
  return null;
}

/**
 * Add strike to user. Returns updated UserStrike.
 */
async function addStrike(userId, opts = {}) {
  const { reason, targetType, targetId, reportId, moderatorId } = opts;
  const expiresAt = new Date(Date.now() + STRIKE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  let record = await db.UserStrike.findOne({ userId });
  if (!record) {
    record = await db.UserStrike.create({ userId, strikeCount: 0, strikes: [] });
  }

  record.strikes.push({
    reason: reason || 'violation',
    targetType,
    targetId,
    reportId,
    moderatorId,
    expiresAt,
  });
  record.strikeCount = record.strikes.length;
  record.lastStrikeAt = new Date();

  if (record.strikeCount >= STRIKE_BAN_THRESHOLD) {
    record.status = 'banned';
    await db.User.updateOne({ _id: userId }, { $set: { status: 'banned', creatorStatus: 'rejected' } }).catch(() => {});
  } else if (record.strikeCount >= STRIKE_SUSPEND_THRESHOLD) {
    record.status = 'suspended';
    record.suspendedUntil = new Date(Date.now() + SUSPEND_DAYS * 24 * 60 * 60 * 1000);
    await db.User.updateOne({ _id: userId }, { $set: { status: 'suspended' } }).catch(() => {});
  }

  await record.save();
  return record;
}

/**
 * Get effective strike count (excluding expired).
 */
function getActiveStrikeCount(strikes) {
  const now = new Date();
  return (strikes || []).filter((s) => !s.expiresAt || new Date(s.expiresAt) > now).length;
}

/**
 * Check if user is suspended or banned.
 */
async function getUserModerationStatus(userId) {
  const record = await db.UserStrike.findOne({ userId }).lean();
  if (!record) return { status: 'active', strikeCount: 0, suspendedUntil: null };
  const activeCount = getActiveStrikeCount(record.strikes);
  const suspendedUntil = record.suspendedUntil && new Date(record.suspendedUntil) > new Date() ? record.suspendedUntil : null;
  return {
    status: record.status,
    strikeCount: activeCount,
    suspendedUntil,
    isSuspended: record.status === 'suspended' && suspendedUntil,
    isBanned: record.status === 'banned',
  };
}

/**
 * Check if user is shadow-banned (Moderation doc, then User or Profile). Effects: FYP down-ranked, comments hidden, live visibility reduced.
 */
async function isShadowBanned(userId) {
  if (!userId) return false;
  const uid = userId?.toString?.() || userId;
  const mod = await db.Moderation?.findOne({ userId: uid }).lean();
  if (mod && mod.shadowBanned) {
    if (mod.expiresAt && new Date(mod.expiresAt) <= new Date()) return false;
    return true;
  }
  const [user, profile] = await Promise.all([
    db.User.findById(uid).select('shadowBanned').lean(),
    db.Profile.findOne({ userId: uid }).select('shadowBanned').lean(),
  ]);
  return !!(user?.shadowBanned || profile?.shadowBanned);
}

/**
 * AI moderation — OpenAI Moderation API when enabled. Set AI_MODERATION_ENABLED + OPENAI_API_KEY.
 */
async function flagForAIReview(contentType, contentId, opts = {}) {
  const { text, imageUrl, videoUrl } = opts;
  const aiMod = require('./aiModeration.service');
  if (!aiMod.isEnabled()) return null;

  if (text || imageUrl || videoUrl) {
    try {
      const scan = await aiMod.moderateUpload({
        text: text || '',
        mediaUrl: imageUrl || videoUrl || '',
        mediaType: videoUrl ? 'video' : 'image',
        contentId: String(contentId),
        contentType,
      });
      const flagged = scan?.decision?.decision === 'block' || scan?.decision?.decision === 'review';
      await db.ModerationLog.create({
        moderatorId: opts.systemUserId || SYSTEM_MODERATOR_ID,
        targetType: contentType,
        targetId: String(contentId),
        action: 'ai_flagged',
        meta: {
          source: 'pipeline',
          providers: scan?.providers || [],
          text: text?.slice(0, 500),
          flagged,
          decision: scan?.decision?.decision,
          confidence: scan?.decision?.confidence,
          categories: scan?.decision?.categories,
          hasImage: !!imageUrl,
          hasVideo: !!videoUrl,
        },
      }).catch(() => {});
      return { flagged, confidence: scan?.decision?.confidence || 0, categories: scan?.decision?.categories || [] };
    } catch {
      return null;
    }
  }
  await db.ModerationLog.create({
    moderatorId: opts.systemUserId || SYSTEM_MODERATOR_ID,
    targetType: contentType,
    targetId: String(contentId),
    action: 'ai_flagged',
    meta: { source: 'ai_stub', hasImage: !!imageUrl, hasVideo: !!videoUrl },
  }).catch(() => {});
  return { flagged: false, confidence: 0 };
}

/**
 * Check if message contains a banned word (keyword filter). Use for live chat / content.
 * @param {string} msg - User message
 * @returns {Promise<boolean>} - true if message should be blocked (contains banned word)
 */
async function moderateMessage(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const allowed = await chatFilter.filterChat(msg.trim());
  return !allowed;
}

module.exports = {
  resolveTargetToUserId,
  addStrike,
  getActiveStrikeCount,
  getUserModerationStatus,
  isShadowBanned,
  flagForAIReview,
  moderateMessage,
  STRIKE_SUSPEND_THRESHOLD,
  STRIKE_BAN_THRESHOLD,
  SUSPEND_DAYS,
};
