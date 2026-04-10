'use strict';
/**
 * Phase 6 — Referral System. Viewer → coins; creator → revenue share.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { credit } = require('@millo/economy');

const VIEWER_REFERRAL_COINS = 50;
const CREATOR_REFERRAL_PCT = 5;
const QUALIFY_DAYS = 7;

function generateInviteCode(userId) {
  const hex = userId.toString().slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'M' + hex + rand;
}

async function getOrCreateInviteCode(userId) {
  let inv = await db.Invite.findOne({ inviterId: userId }).sort({ createdAt: -1 }).lean();
  if (inv && inv.code) return inv.code;
  const code = generateInviteCode(userId);
  inv = await db.Invite.create({
    code,
    inviterId: userId,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
  return inv.code;
}

async function registerReferral(referrerId, newUserId, inviteCode) {
  const existing = await db.Referral.findOne({ newUserId }).lean();
  if (existing) return existing;

  let resolvedReferrer = referrerId;
  if (!resolvedReferrer && inviteCode) {
    const inv = await db.Invite.findOne({ code: inviteCode }).lean();
    resolvedReferrer = inv && inv.inviterId;
  }
  if (!resolvedReferrer) throw new Error('INVALID_INVITE_CODE');

  const referrer = await db.User.findById(resolvedReferrer).select('creatorStatus').lean();
  const isCreator = referrer && referrer.creatorStatus === 'approved';
  const rewardType = isCreator ? 'revenue_share' : 'coins';
  const rewardAmount = isCreator ? CREATOR_REFERRAL_PCT : VIEWER_REFERRAL_COINS;

  return db.Referral.create({
    referrerId: resolvedReferrer,
    newUserId,
    rewardAmount,
    rewardType,
    status: 'pending',
    inviteCode: inviteCode || null,
  });
}

async function qualifyReferral(newUserId) {
  const ref = await db.Referral.findOne({ newUserId, status: 'pending' });
  if (!ref) return null;
  const daysSince = (Date.now() - ref.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (daysSince > QUALIFY_DAYS) {
    ref.status = 'expired';
    await ref.save();
    return null;
  }
  ref.status = 'qualified';
  await ref.save();
  return ref;
}

async function rewardReferral(newUserId) {
  const ref = await db.Referral.findOne({ newUserId, status: 'qualified' });
  if (!ref) return null;
  if (ref.rewardType === 'coins' && ref.rewardAmount > 0) {
    await credit(ref.referrerId, ref.rewardAmount, 'referral', String(ref._id), { newUserId: String(newUserId) });
  }
  ref.status = 'rewarded';
  await ref.save();
  return ref;
}

async function getReferralStats(userId) {
  const [total, qualified, rewarded, inviteCode] = await Promise.all([
    db.Referral.countDocuments({ referrerId: userId }),
    db.Referral.countDocuments({ referrerId: userId, status: 'qualified' }),
    db.Referral.countDocuments({ referrerId: userId, status: 'rewarded' }),
    getOrCreateInviteCode(userId),
  ]);
  return { total, qualified, rewarded, inviteCode };
}

module.exports = {
  getOrCreateInviteCode,
  registerReferral,
  qualifyReferral,
  rewardReferral,
  getReferralStats,
  VIEWER_REFERRAL_COINS,
  CREATOR_REFERRAL_PCT,
};
