'use strict';
/**
 * Revenue split engine — API facade over `@millo/economy` pricing + credits.
 *
 * **Standard 50/50 (TikTok-style product default for this helper):** platform and creator each get half of **gross cents**;
 * odd cent stays with the creator so the sum always equals gross.
 *
 * **Configurable splits** (marketing defaults, tiers): use `economy.pricing.splitRevenue` / `splitRevenueByCreator`.
 *
 * Amounts are always **integer cents** (no float dollars). Financial audit + ledger run inside `economy.credit`.
 *
 * Platform share wallet: set `PLATFORM_WALLET_USER_ID` to a dedicated User id for `creditPlatform`; otherwise
 * `creditPlatform` skips wallet credit (track platform revenue via `PaymentTransaction` / dashboards as today).
 * https://milloapp.com
 */

const economy = require('@millo/economy');

/**
 * 50/50 split on gross cents.
 * @param {number} amountCents — gross amount in cents (e.g. 100 = $1.00)
 * @returns {{ platformCents: number, creatorCents: number, platform: number, creator: number }}
 */
function splitRevenue(amountCents) {
  const g = Math.floor(Number(amountCents));
  if (!Number.isFinite(g) || g < 0) {
    throw new Error('INVALID_AMOUNT_CENTS');
  }
  const platformCents = Math.floor(g / 2);
  const creatorCents = g - platformCents;
  return {
    platformCents,
    creatorCents,
    platform: platformCents,
    creator: creatorCents,
  };
}

/**
 * Delegate to DB-backed pricing (default 25% platform / 75% creator unless PlatformSettings override).
 * @param {number} grossCents
 * @returns {{ platformCents: number, creatorCents: number }}
 */
function splitRevenueFromPricing(grossCents) {
  return economy.pricing.splitRevenue(grossCents);
}

/**
 * Tier-aware split (shop / subscription / live / ppv).
 * @param {string|import('mongoose').Types.ObjectId} creatorId
 * @param {number} grossCents
 * @param {'ppv'|'shop'|'subscription'|'live'} [type]
 */
async function splitRevenueByCreator(creatorId, grossCents, type = 'ppv') {
  return economy.pricing.splitRevenueByCreator(creatorId, grossCents, type);
}

/**
 * Credit creator internal wallet (coins path + ledger + audit).
 * @param {string|import('mongoose').Types.ObjectId} creatorId
 * @param {number} creatorCents
 * @param {string} refType
 * @param {string} [refId]
 * @param {object} [meta]
 */
async function creditWallet(creatorId, creatorCents, refType, refId, meta = {}) {
  const n = Math.floor(Number(creatorCents));
  if (!creatorId || !Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: 'INVALID_CREDIT' };
  }
  const out = await economy.credit(creatorId, n, refType, refId != null ? String(refId) : undefined, meta);
  return { ok: true, ...out };
}

/**
 * Credit platform share to configured treasury user, if `PLATFORM_WALLET_USER_ID` is set.
 * @param {number} platformCents
 * @param {string} refType
 * @param {string} [refId]
 * @param {object} [meta]
 */
async function creditPlatform(platformCents, refType, refId, meta = {}) {
  const n = Math.floor(Number(platformCents));
  const uid = process.env.PLATFORM_WALLET_USER_ID;
  if (!uid || !Number.isFinite(n) || n <= 0) {
    return { ok: false, skipped: true, reason: uid ? 'ZERO_AMOUNT' : 'NO_PLATFORM_WALLET_USER_ID' };
  }
  const out = await economy.credit(uid, n, refType || 'platform_revenue_share', refId != null ? String(refId) : undefined, {
    ...meta,
    revenueSplit: 'platform',
  });
  return { ok: true, ...out };
}

/**
 * Apply standard 50/50 split and credit both arms (creator always; platform if env configured).
 * @param {string|import('mongoose').Types.ObjectId} creatorId
 * @param {number} grossCents
 * @param {string} refType
 * @param {string} [refId]
 * @param {object} [meta]
 */
async function applyStandardSplit50(creatorId, grossCents, refType, refId, meta = {}) {
  const { platformCents, creatorCents } = splitRevenue(grossCents);
  const [creatorResult, platformResult] = await Promise.all([
    creditWallet(creatorId, creatorCents, refType, refId, { ...meta, split: 'creator' }),
    creditPlatform(platformCents, refType, refId, { ...meta, split: 'platform' }),
  ]);
  return { platformCents, creatorCents, creatorResult, platformResult };
}

module.exports = {
  splitRevenue,
  splitRevenueFromPricing,
  splitRevenueByCreator,
  creditWallet,
  creditPlatform,
  applyStandardSplit50,
};
