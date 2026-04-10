'use strict';
/**
 * Regional coin pack validator (Phase 5). Reject if pack.country !== user.country.
 * https://milloapp.com
 */

/**
 * Normalize country to ISO 3166-1 alpha-2 (uppercase).
 * @param {string} [c]
 * @returns {string|null}
 */
function normalizeCountry(c) {
  if (!c || typeof c !== 'string') return null;
  const t = c.trim().toUpperCase();
  return t.length === 2 ? t : null;
}

/**
 * Validate that the pack is allowed for the user's country. Rejects if pack has country and it doesn't match.
 * @param {Object} pack - Pack object with optional .country
 * @param {string} [userCountry] - User's country (from profile, request.region, or body)
 * @returns {{ allowed: boolean, error?: string }}
 */
function validateCoinPackRegion(pack, userCountry) {
  const packCountry = normalizeCountry(pack?.country);
  if (!packCountry) return { allowed: true };
  const user = normalizeCountry(userCountry);
  if (!user) return { allowed: true }; // no user country → allow (caller may require country elsewhere)
  if (packCountry !== user) {
    return { allowed: false, error: 'REGION_MISMATCH', message: 'This coin pack is not available in your region.' };
  }
  return { allowed: true };
}

module.exports = { validateCoinPackRegion, normalizeCountry };
