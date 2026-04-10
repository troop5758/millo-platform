'use strict';
/**
 * Commerce seller gate — DTO check: `if (!seller.verified) throw new Error("Seller not verified")`.
 * For database-backed verification (blocked / pending), use `assertSellerVerified(userId)` from this module.
 * https://milloapp.com
 */

const commerceIntegrity = require('../../services/commerceIntegrity.service');

/**
 * In-memory / API DTO guard (`seller.verified` or `sellerStatus === 'verified'`).
 * @param {{ verified?: boolean, sellerStatus?: string, status?: string }|null|undefined} seller
 * @throws {Error} "Seller not verified"
 */
function enforceSellerVerified(seller) {
  if (!seller || typeof seller !== 'object') {
    throw new Error('Seller not verified');
  }
  const ok =
    seller.verified === true ||
    seller.sellerStatus === 'verified' ||
    seller.status === 'approved';
  if (!ok) {
    throw new Error('Seller not verified');
  }
}

module.exports = {
  enforceSellerVerified,
  assertSellerVerified: commerceIntegrity.assertSellerVerified,
  isSellerVerifiedForCommerce: commerceIntegrity.isSellerVerifiedForCommerce,
  getEffectiveSellerStatus: commerceIntegrity.getEffectiveSellerStatus,
  getCommerceSellerStatusForUser: commerceIntegrity.getCommerceSellerStatusForUser,
  isCommerceSellerVerificationRequired: commerceIntegrity.isCommerceSellerVerificationRequired,
  SellerNotVerifiedError: commerceIntegrity.SellerNotVerifiedError,
  SellerBlockedError: commerceIntegrity.SellerBlockedError,
};
