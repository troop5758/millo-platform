'use strict';
/**
 * Verified Creator — monetization unlocked.
 * Requirements: account age 30+ days, 500+ followers, phone verified, KYC, 2FA, no violations.
 * Capabilities: unlimited gifts, withdraw earnings, leaderboards, live monetization.
 * https://milloapp.com
 */
const db = require('@millo/database');

const MIN_ACCOUNT_AGE_DAYS = 30;
const MIN_FOLLOWERS = 500;

let _kycService = null;
let _creatorUpgradeService = null;

function getKycService() {
  if (_kycService) return _kycService;
  try {
    _kycService = require('./kycService');
    return _kycService;
  } catch {
    return null;
  }
}

function getCreatorUpgradeService() {
  if (_creatorUpgradeService) return _creatorUpgradeService;
  try {
    _creatorUpgradeService = require('./creatorUpgradeService');
    return _creatorUpgradeService;
  } catch {
    return null;
  }
}

/**
 * Check if user meets verified creator requirements.
 * Returns { verified: boolean, checks: { accountAge, followers, phoneVerified, kyc, twoFa, noViolations } }.
 */
async function getVerificationStatus(userId) {
  const thresholds = await getThresholds();
  const minAge = thresholds.minAccountAgeDays;
  const minFollowers = thresholds.minFollowers;

  const [user, kycApproved, followerCount, userStrike] = await Promise.all([
    db.User.findById(userId).select('createdAt emailVerified phoneVerified creatorStatus flags').lean(),
    getKycService() ? getKycService().isKycApproved(userId).catch(() => false) : Promise.resolve(false),
    db.Follow.countDocuments({ followingId: userId }),
    db.UserStrike.findOne({ userId }).select('strikeCount status').lean(),
  ]);

  if (!user) {
    return { verified: false, checks: {}, message: 'USER_NOT_FOUND' };
  }

  const now = new Date();
  const accountAgeDays = user.createdAt
    ? Math.floor((now - new Date(user.createdAt)) / (24 * 60 * 60 * 1000))
    : 0;
  const accountAgeOk = accountAgeDays >= minAge;

  const followersOk = followerCount >= minFollowers;
  const phoneVerified = user.phoneVerified === true;
  const twoFaEnabled = user.flags?.totpEnabled === true;
  const noViolations = !userStrike || (userStrike.strikeCount === 0 && userStrike.status === 'active');

  const verified = accountAgeOk && followersOk && phoneVerified && kycApproved && twoFaEnabled && noViolations;

  return {
    verified: !!verified,
    checks: {
      accountAge: { met: accountAgeOk, value: accountAgeDays, required: minAge, label: `Account age ${minAge}+ days` },
      followers: { met: followersOk, value: followerCount, required: minFollowers, label: `${minFollowers}+ followers` },
      phoneVerified: { met: phoneVerified, label: 'Phone verified' },
      kyc: { met: kycApproved, label: 'ID verification (KYC)' },
      twoFa: { met: twoFaEnabled, label: '2FA enabled' },
      noViolations: { met: noViolations, label: 'No violations' },
    },
    capabilities: verified
      ? { unlimitedGifts: true, withdrawEarnings: true, leaderboards: true, liveMonetization: true }
      : null,
  };
}

/**
 * Whether this user is a verified creator (all requirements met).
 * Creator must also be approved (creatorStatus or paid upgrade) for monetization; this checks verification bar only.
 */
async function isVerifiedCreator(userId) {
  const status = await getVerificationStatus(userId);
  return status.verified === true;
}

/**
 * Whether user is eligible for payout (verified creator).
 * Used by payout orchestration and gift receiver eligibility.
 */
async function canWithdrawEarnings(userId) {
  return isVerifiedCreator(userId);
}

/**
 * Whether user can appear on creator leaderboards (verified).
 */
async function canJoinLeaderboards(userId) {
  return isVerifiedCreator(userId);
}

/**
 * Whether user has live monetization unlocked (verified).
 * Can be used by creatorReputationService or live routes.
 */
async function hasLiveMonetizationUnlocked(userId) {
  return isVerifiedCreator(userId);
}

/**
 * Get configurable thresholds from platform settings (optional).
 */
async function getThresholds() {
  let minAge = MIN_ACCOUNT_AGE_DAYS;
  let minFollowers = MIN_FOLLOWERS;
  try {
    const [ageDoc, folDoc] = await Promise.all([
      db.PlatformSetting.findOne({ key: 'verified_creator_min_account_age_days' }).lean(),
      db.PlatformSetting.findOne({ key: 'verified_creator_min_followers' }).lean(),
    ]);
    if (ageDoc?.value != null) minAge = Math.max(1, Number(ageDoc.value));
    if (folDoc?.value != null) minFollowers = Math.max(0, Number(folDoc.value));
  } catch {}
  return { minAccountAgeDays: minAge, minFollowers };
}

module.exports = {
  MIN_ACCOUNT_AGE_DAYS,
  MIN_FOLLOWERS,
  getVerificationStatus,
  isVerifiedCreator,
  canWithdrawEarnings,
  canJoinLeaderboards,
  hasLiveMonetizationUnlocked,
  getThresholds,
};
