'use strict';
/**
 * Serialize wallet mutations from packages that cannot depend on @millo/api (e.g. billing).
 * Same Redis key as API withRedisLock + coins: millo:lock:wallet:{userId}
 * https://milloapp.com
 */
const redisLock = require('./utils/redisLock');

const WALLET_TTL_MS = Math.min(Number(process.env.WALLET_LOCK_MS) || 15_000, 120_000);
const WALLET_TTL_SEC = Math.max(1, Math.ceil(WALLET_TTL_MS / 1000));

function walletRedisLockKey(userId) {
  return `millo:lock:wallet:${String(userId)}`;
}

async function withWalletLock(userId, fn) {
  const key = walletRedisLockKey(userId);
  return redisLock.withLock(key, fn, WALLET_TTL_SEC);
}

module.exports = { withWalletLock, walletRedisLockKey, WALLET_TTL_MS };
