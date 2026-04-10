'use strict';
/**
 * Gift receiver eligibility — free vs paid vs verified vs trusted creator rules.
 * Free: daily cap, pending earnings, no payout.
 * Paid: no daily cap, earnings pending until verified.
 * Verified: no cap, withdrawable (7-day hold on gift earnings to stop chargeback fraud).
 * Trusted: no cap, instant payouts, full monetization (brand sponsorship, live auctions, premium meetings).
 * https://milloapp.com
 */
const db = require('@millo/database');

const FREE_CREATOR_MAX_DAILY_GIFT_CENTS = 5000; // $50
const GIFT_HOLD_DAYS_VERIFIED = 7; // verified (non-trusted): gift earnings held 7 days

let _creatorUpgradeService = null;
let _verifiedCreatorService = null;
let _trustedCreatorService = null;

function getCreatorUpgradeService() {
  if (_creatorUpgradeService) return _creatorUpgradeService;
  try {
    _creatorUpgradeService = require('./creatorUpgradeService');
    return _creatorUpgradeService;
  } catch {
    return null;
  }
}

function getVerifiedCreatorService() {
  if (_verifiedCreatorService) return _verifiedCreatorService;
  try {
    _verifiedCreatorService = require('./verifiedCreatorService');
    return _verifiedCreatorService;
  } catch {
    return null;
  }
}

function getTrustedCreatorService() {
  if (_trustedCreatorService) return _trustedCreatorService;
  try {
    _trustedCreatorService = require('./trustedCreatorService');
    return _trustedCreatorService;
  } catch {
    return null;
  }
}

/**
 * Get max daily gift value (cents) for free creators from platform settings or default.
 */
async function getFreeCreatorDailyCapCents() {
  try {
    const doc = await db.PlatformSetting.findOne({ key: 'free_creator_max_daily_gift_cents' }).lean();
    if (doc?.value != null) return Math.max(100, Number(doc.value));
  } catch {}
  return FREE_CREATOR_MAX_DAILY_GIFT_CENTS;
}

/**
 * Receiver tier: 'trusted' = full monetization, instant payouts;
 * 'verified' = payout allowed with 7-day hold on gift earnings;
 * 'paid' = upgrade but not verified (unlimited gifts, earnings pending);
 * 'free' = no upgrade, daily cap, pending earnings.
 */
async function getReceiverTier(receiverId) {
  const trustedSvc = getTrustedCreatorService();
  if (trustedSvc && (await trustedSvc.isTrustedCreator(receiverId))) {
    return 'trusted';
  }
  const verifiedSvc = getVerifiedCreatorService();
  if (verifiedSvc && (await verifiedSvc.isVerifiedCreator(receiverId))) {
    return 'verified';
  }
  const creatorUpgrade = getCreatorUpgradeService();
  if (creatorUpgrade && (await creatorUpgrade.hasActiveCreatorAccess(receiverId))) {
    return 'paid';
  }
  return 'free';
}

/**
 * Sum of gift credits (in cents) received by this user today (UTC date).
 * Used to enforce daily cap for free creators.
 */
async function getFreeCreatorDailyReceivedCents(receiverId) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const agg = await db.LedgerEntry.aggregate([
    {
      $match: {
        actorId: receiverId,
        type: 'credit',
        refType: 'gift',
        createdAt: { $gte: todayStart, $lt: todayEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  const total = agg[0]?.total ?? 0;
  return Math.max(0, total);
}

/**
 * Check if adding this amount would stay within free creator daily cap.
 * Returns { allowed: boolean, dailyReceived: number, capCents: number, wouldExceedBy: number }.
 */
async function checkFreeCreatorDailyCap(receiverId, additionalCents) {
  const [dailyReceived, capCents] = await Promise.all([
    getFreeCreatorDailyReceivedCents(receiverId),
    getFreeCreatorDailyCapCents(),
  ]);
  const totalAfter = dailyReceived + Math.max(0, additionalCents);
  const allowed = totalAfter <= capCents;
  return {
    allowed,
    dailyReceived,
    capCents,
    wouldExceedBy: allowed ? 0 : totalAfter - capCents,
  };
}

/**
 * Whether this receiver should receive gift earnings as "pending" (no payout until verified).
 * True for free and paid-but-not-verified creators.
 */
async function shouldReceiveAsPending(receiverId) {
  const tier = await getReceiverTier(receiverId);
  return tier !== 'verified' && tier !== 'trusted';
}

/**
 * Whether gift earnings for this receiver should get a 7-day hold (chargeback protection).
 * True for verified but not trusted; false for trusted (instant) and for free/paid (pending only).
 */
async function shouldApplyGiftHold(receiverId) {
  const tier = await getReceiverTier(receiverId);
  return tier === 'verified';
}

/**
 * Hold period in days for gift-sourced earnings when shouldApplyGiftHold is true.
 */
function getGiftHoldDays() {
  return GIFT_HOLD_DAYS_VERIFIED;
}

/**
 * Summary for API: can receive, daily cap, received today, payout allowed, instant payout.
 */
async function getReceiverEligibilitySummary(receiverId) {
  const tier = await getReceiverTier(receiverId);
  const capCents = await getFreeCreatorDailyCapCents();
  const dailyReceived = tier === 'free' ? await getFreeCreatorDailyReceivedCents(receiverId) : null;
  const payoutAllowed = tier === 'verified' || tier === 'trusted';
  const instantPayout = tier === 'trusted';
  return {
    tier,
    canReceiveGifts: true,
    maxDailyGiftCents: tier === 'free' ? capCents : null,
    dailyReceivedCents: dailyReceived,
    payoutAllowed,
    pendingEarnings: tier !== 'verified' && tier !== 'trusted',
    instantPayout,
    giftHoldDays: tier === 'verified' ? GIFT_HOLD_DAYS_VERIFIED : null,
  };
}

module.exports = {
  FREE_CREATOR_MAX_DAILY_GIFT_CENTS,
  GIFT_HOLD_DAYS_VERIFIED,
  getFreeCreatorDailyCapCents,
  getReceiverTier,
  getFreeCreatorDailyReceivedCents,
  checkFreeCreatorDailyCap,
  shouldReceiveAsPending,
  shouldApplyGiftHold,
  getGiftHoldDays,
  getReceiverEligibilitySummary,
};
