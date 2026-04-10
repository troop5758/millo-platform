/**
 * Adult Content Compliance — Phase 9. Age verification, content categories, regional restrictions.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { getAge, isAgeAllowed, ageFromDateOfBirth, MINIMUM_AGE_YEARS } = require('./ageGating');

const ADULT_MINIMUM_AGE = 18;

const CONTENT_CATEGORIES = ['safe', 'mature', 'explicit'];

/**
 * Get region by code. Returns null if not found.
 */
async function getRegion(regionCode) {
  if (!regionCode) return null;
  const code = String(regionCode).toUpperCase().trim();
  return db.Region.findOne({ region_code: code }).lean();
}

/**
 * Check if user can access content of given category in given region.
 * @param {string} userId - User ID
 * @param {string} contentCategory - safe | mature | explicit
 * @param {string} regionCode - Region code (e.g. US, EU)
 * @returns {{ allowed: boolean, reason?: string }}
 */
async function canAccessContent(userId, contentCategory, regionCode) {
  const cat = contentCategory || 'safe';
  if (cat === 'safe') return { allowed: true };

  const region = await getRegion(regionCode);
  if (region && region.adult_content_allowed === false) {
    return { allowed: false, reason: 'region_restricted' };
  }

  const profile = await db.Profile.findOne({ userId }).lean();
  const ageVerified = !!profile?.ageVerifiedAt;
  const idVerified = !!profile?.idVerifiedAt;
  const ageResult = await isAgeAllowed(userId, ADULT_MINIMUM_AGE);

  const requiresId = region?.age_verification_required === true || cat === 'explicit';

  if (ageResult.allowed === false) {
    return { allowed: false, reason: 'below_minimum', age: ageResult.age, minimumAge: ADULT_MINIMUM_AGE };
  }
  if (ageResult.allowed === null && !ageVerified) {
    return { allowed: false, reason: 'age_unknown', requiresVerification: true };
  }
  if (requiresId && !idVerified && !ageVerified) {
    return { allowed: false, reason: 'verification_required', requiresId, requiresAge: true };
  }
  if (requiresId && !idVerified && ageVerified) {
    return { allowed: false, reason: 'id_verification_required', requiresId: true };
  }

  return { allowed: true };
}

/**
 * Get age gate status for current user/region. Used by frontend to show age gate modal.
 * @param {string} userId - User ID
 * @param {string} regionCode - Region code
 * @param {number} minimumAge - Override minimum age (default 18 for adult)
 * @returns {{ required: boolean, reason?: string, minimumAge: number, ageVerified: boolean, idVerified: boolean }}
 */
async function getAgeGateStatus(userId, regionCode, minimumAge = ADULT_MINIMUM_AGE) {
  const region = await getRegion(regionCode);
  const profile = await db.Profile.findOne({ userId }).lean();
  const ageVerified = !!profile?.ageVerifiedAt;
  const idVerified = !!profile?.idVerifiedAt;
  const ageResult = await isAgeAllowed(userId, minimumAge);

  const adultBlocked = region?.adult_content_allowed === false;
  const verificationRequired = region?.age_verification_required === true;

  if (adultBlocked) {
    return { required: true, reason: 'region_restricted', minimumAge, ageVerified, idVerified };
  }
  if (ageResult.allowed === false) {
    return { required: true, reason: 'below_minimum', minimumAge, age: ageResult.age, ageVerified, idVerified };
  }
  if (ageResult.allowed === null && !ageVerified) {
    return { required: true, reason: 'age_unknown', minimumAge, ageVerified, idVerified };
  }
  if (verificationRequired && !idVerified && !ageVerified) {
    return { required: true, reason: 'verification_required', minimumAge, ageVerified, idVerified };
  }
  if (verificationRequired && !idVerified && ageVerified) {
    return { required: true, reason: 'id_verification_required', minimumAge, ageVerified, idVerified };
  }

  return { required: false, minimumAge, ageVerified, idVerified };
}

/**
 * Verify user age (DOB attestation). Sets ageVerifiedAt when age check passes.
 * @param {string} userId - User ID
 * @param {number} minimumAge - Minimum age (default 18)
 * @returns {{ verified: boolean, reason?: string }}
 */
async function verifyAge(userId, minimumAge = ADULT_MINIMUM_AGE) {
  const ageResult = await isAgeAllowed(userId, minimumAge);
  if (ageResult.allowed === false) {
    return { verified: false, reason: 'below_minimum', age: ageResult.age };
  }
  if (ageResult.allowed === null) {
    return { verified: false, reason: 'age_unknown', message: 'Date of birth required' };
  }
  await db.Profile.findOneAndUpdate(
    { userId },
    { $set: { ageVerifiedAt: new Date() } },
    { upsert: true }
  );
  return { verified: true };
}

/**
 * Mark user as ID-verified (e.g. after KYC). Typically set by KYC callback; this allows admin/support override.
 * @param {string} userId - User ID
 */
async function verifyId(userId) {
  await db.Profile.findOneAndUpdate(
    { userId },
    { $set: { idVerifiedAt: new Date() } },
    { upsert: true }
  );
  return { verified: true };
}

/**
 * Build content filter query for mature/explicit based on user access.
 * Returns MongoDB query fragment to add to find() for LiveStream or Product.
 */
function contentFilterForUser(hasAdultAccess) {
  if (hasAdultAccess) return {};
  return { contentCategory: { $nin: ['mature', 'explicit'] } };
}

module.exports = {
  CONTENT_CATEGORIES,
  ADULT_MINIMUM_AGE,
  canAccessContent,
  getAgeGateStatus,
  verifyAge,
  verifyId,
  contentFilterForUser,
  getRegion,
};
