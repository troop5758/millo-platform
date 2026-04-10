'use strict';
/**
 * Commerce integrity — seller state machine (verified | pending | blocked) + verification gate for listings/checkout.
 * https://milloapp.com
 */
const db = require('@millo/database');

class SellerNotVerifiedError extends Error {
  constructor(message = 'Seller not verified') {
    super(message);
    this.name = 'SellerNotVerifiedError';
    this.code = 'SELLER_NOT_VERIFIED';
    this.statusCode = 403;
  }
}

class SellerBlockedError extends Error {
  constructor(message = 'Seller account is blocked from commerce') {
    super(message);
    this.name = 'SellerBlockedError';
    this.code = 'SELLER_BLOCKED';
    this.statusCode = 403;
  }
}

/**
 * Hard enforcement by default: all environments require approved seller verification for gated routes.
 * Opt out only with COMMERCE_REQUIRE_SELLER_VERIFICATION=false (local/staging only).
 */
function isCommerceSellerVerificationRequired() {
  return process.env.COMMERCE_REQUIRE_SELLER_VERIFICATION !== 'false';
}

/**
 * Canonical tri-state for Commerce Integrity Layer (API + clients).
 * @param {{ status?: string, sellerStatus?: string }|null|undefined} doc — latest SellerVerification lean doc
 * @returns {'verified'|'pending'|'blocked'}
 */
function getEffectiveSellerStatus(doc) {
  if (!doc) return 'pending';
  const ss = doc.sellerStatus;
  if (ss === 'blocked' || ss === 'verified' || ss === 'pending') return ss;
  return doc.status === 'approved' ? 'verified' : 'pending';
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<'verified'|'pending'|'blocked'>}
 */
async function getCommerceSellerStatusForUser(userId) {
  if (!userId) return 'pending';
  const uid = String(userId);
  const sv = await db.SellerVerification.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
  return getEffectiveSellerStatus(sv);
}

/**
 * @param {string|import('mongoose').Types.ObjectId} creatorId
 * @returns {Promise<boolean>}
 */
async function isSellerVerifiedForCommerce(creatorId) {
  if (!creatorId) return false;
  const uid = String(creatorId);

  const sv = await db.SellerVerification.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
  if (sv) {
    const st = getEffectiveSellerStatus(sv);
    if (st === 'blocked') return false;
    if (st === 'verified') return true;
  }

  const store = await db.StorefrontCustomization.findOne({ creatorId: uid }).select('storeMetrics').lean();
  if (store?.storeMetrics?.verifiedSeller === true) return true;

  return false;
}

/**
 * Enforces verified seller for commerce mutations (equivalent: if (!seller.verified) throw …).
 * @param {string|import('mongoose').Types.ObjectId} creatorId
 * @throws {SellerNotVerifiedError|SellerBlockedError}
 */
async function assertSellerVerified(creatorId) {
  if (!isCommerceSellerVerificationRequired()) return;
  const st = await getCommerceSellerStatusForUser(creatorId);
  if (st === 'blocked') throw new SellerBlockedError();
  if (st === 'verified') return;
  const legacyOk = await isSellerVerifiedForCommerce(creatorId);
  if (!legacyOk) throw new SellerNotVerifiedError('Seller not verified');
}

module.exports = {
  assertSellerVerified,
  isSellerVerifiedForCommerce,
  getEffectiveSellerStatus,
  getCommerceSellerStatusForUser,
  isCommerceSellerVerificationRequired,
  SellerNotVerifiedError,
  SellerBlockedError,
};
