'use strict';
/**
 * Redis locks for wallet + auction mutations (same key space as withRedisLock: millo:lock:*).
 * Order: always acquire auction lock before wallet locks to match bid/end settlement and avoid deadlocks.
 * https://milloapp.com
 */
const { withRedisLock, LockContentionError } = require('./withRedisLock');

const DEFAULT_WALLET_TTL_MS = Math.min(Number(process.env.WALLET_LOCK_MS) || 15_000, 120_000);
const DEFAULT_AUCTION_TTL_MS = Math.min(Number(process.env.AUCTION_LOCK_MS) || 20_000, 120_000);

async function withWalletLock(userId, fn, ttlMs = DEFAULT_WALLET_TTL_MS) {
  const { result } = await withRedisLock(`wallet:${String(userId)}`, ttlMs, fn);
  return result;
}

async function withAuctionLock(auctionId, fn, ttlMs = DEFAULT_AUCTION_TTL_MS) {
  const { result } = await withRedisLock(`auction:${String(auctionId)}`, ttlMs, fn);
  return result;
}

/** Nested wallet locks in deterministic sorted order (caller must not hold other wallet locks). */
async function withOrderedWalletLocks(userIds, fn, ttlMs = DEFAULT_WALLET_TTL_MS) {
  const uniq = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))].sort();
  async function step(i) {
    if (i >= uniq.length) return fn();
    const { result } = await withRedisLock(`wallet:${uniq[i]}`, ttlMs, () => step(i + 1));
    return result;
  }
  return step(0);
}

/**
 * Auction-sensitive flow: auction first, then wallets (sorted). Use for bids and settlement.
 */
async function withAuctionThenWallets(auctionId, userIds, fn, ttlAuction, ttlWallet) {
  return withAuctionLock(
    auctionId,
    () => withOrderedWalletLocks(userIds, fn, ttlWallet ?? DEFAULT_WALLET_TTL_MS),
    ttlAuction ?? DEFAULT_AUCTION_TTL_MS
  );
}

module.exports = {
  withWalletLock,
  withAuctionLock,
  withOrderedWalletLocks,
  withAuctionThenWallets,
  LockContentionError,
  DEFAULT_WALLET_TTL_MS,
  DEFAULT_AUCTION_TTL_MS,
};
