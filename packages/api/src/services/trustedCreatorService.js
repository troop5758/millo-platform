'use strict';
/**
 * Trusted Creator — full monetization: instant payouts, brand sponsorship, live auctions, premium meetings.
 * Requirements: verified creator + 5,000+ followers, good reputation (CRS >= 70), KYC, payment account verified.
 * https://milloapp.com
 */
const db = require('@millo/database');

const MIN_FOLLOWERS_TRUSTED = 5000;
const MIN_REPUTATION_SCORE = 70; // good_standing band

let _verifiedCreatorService = null;
let _creatorReputationService = null;
let _kycService = null;

function getVerifiedCreatorService() {
  if (_verifiedCreatorService) return _verifiedCreatorService;
  try {
    _verifiedCreatorService = require('./verifiedCreatorService');
    return _verifiedCreatorService;
  } catch {
    return null;
  }
}

function getCreatorReputationService() {
  if (_creatorReputationService) return _creatorReputationService;
  try {
    _creatorReputationService = require('./creatorReputationService');
    return _creatorReputationService;
  } catch {
    return null;
  }
}

function getKycService() {
  if (_kycService) return _kycService;
  try {
    _kycService = require('./kycService');
    return _kycService;
  } catch {
    return null;
  }
}

/**
 * Whether creator has a verified payment account (Stripe Connect, PayPal, or Wise configured).
 */
async function hasPaymentAccountVerified(userId) {
  const cw = await db.CreatorWallet.findOne({ creatorId: userId }).select('stripeConnectAccountId paypalPayoutEmail wiseProfileId').lean();
  if (!cw) return false;
  return !!(cw.stripeConnectAccountId || cw.paypalPayoutEmail || cw.wiseProfileId);
}

/**
 * Get trusted creator status and per-requirement checks.
 * Trusted implies verified; all verified requirements plus: 5k+ followers, CRS >= 70, payment account verified.
 */
async function getTrustedStatus(userId) {
  const verifiedSvc = getVerifiedCreatorService();
  if (!verifiedSvc) {
    return { trusted: false, checks: {}, message: 'SERVICE_UNAVAILABLE' };
  }
  const verified = await verifiedSvc.isVerifiedCreator(userId);
  if (!verified) {
    const verificationStatus = await verifiedSvc.getVerificationStatus(userId);
    return {
      trusted: false,
      checks: { verified: { met: false, label: 'Must be verified creator first' }, ...verificationStatus.checks },
      capabilities: null,
    };
  }

  const [followerCount, reputation, kycApproved, paymentVerified] = await Promise.all([
    db.Follow.countDocuments({ followingId: userId }),
    getCreatorReputationService() ? getCreatorReputationService().getCreatorReputation(userId).catch(() => ({ score: 0 })) : { score: 0 },
    getKycService() ? getKycService().isKycApproved(userId).catch(() => false) : false,
    hasPaymentAccountVerified(userId),
  ]);

  const minFollowers = await getMinFollowersTrusted();
  const minReputation = await getMinReputationTrusted();
  const followersOk = followerCount >= minFollowers;
  const reputationOk = (reputation?.score ?? 0) >= minReputation;

  const trusted = followersOk && reputationOk && kycApproved && paymentVerified;

  return {
    trusted: !!trusted,
    checks: {
      verified: { met: true, label: 'Verified creator' },
      followers: { met: followersOk, value: followerCount, required: minFollowers, label: `${minFollowers}+ followers` },
      reputation: { met: reputationOk, value: reputation?.score ?? 0, required: minReputation, label: `Good reputation (${minReputation}+)` },
      kyc: { met: kycApproved, label: 'Completed KYC' },
      paymentAccountVerified: { met: paymentVerified, label: 'Payment account verified' },
    },
    capabilities: trusted
      ? { unlimitedGifts: true, instantPayouts: true, brandSponsorship: true, liveAuctions: true, premiumMeetings: true }
      : null,
  };
}

/**
 * Whether user is a trusted creator (all requirements met). Implies verified.
 */
async function isTrustedCreator(userId) {
  const status = await getTrustedStatus(userId);
  return status.trusted === true;
}

/**
 * Whether creator gets instant payouts (no 7-day gift hold). True only for trusted.
 */
async function instantPayoutEligible(userId) {
  return isTrustedCreator(userId);
}

/**
 * Configurable min followers for trusted (PlatformSetting).
 */
async function getMinFollowersTrusted() {
  try {
    const doc = await db.PlatformSetting.findOne({ key: 'trusted_creator_min_followers' }).lean();
    if (doc?.value != null) return Math.max(0, Number(doc.value));
  } catch {}
  return MIN_FOLLOWERS_TRUSTED;
}

/**
 * Configurable min reputation score for trusted (PlatformSetting).
 */
async function getMinReputationTrusted() {
  try {
    const doc = await db.PlatformSetting.findOne({ key: 'trusted_creator_min_reputation_score' }).lean();
    if (doc?.value != null) return Math.max(0, Math.min(100, Number(doc.value)));
  } catch {}
  return MIN_REPUTATION_SCORE;
}

module.exports = {
  MIN_FOLLOWERS_TRUSTED,
  MIN_REPUTATION_SCORE,
  getTrustedStatus,
  isTrustedCreator,
  instantPayoutEligible,
  hasPaymentAccountVerified,
  getMinFollowersTrusted,
  getMinReputationTrusted,
};
