/**
 * Coins — credit/debit with ledger + financial audit. Double-spend impossible (atomic debit).
 * Phase 2: Redis distributed lock around debit to prevent concurrent double spend.
 * Phase 5: Also credits CreatorWallet when recipient is an approved creator.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { writeFinancialAuditLog } = db;
const ledger = require('./ledger');
const creatorWallet = require('./creatorWallet');
const redisLock = require('./utils/redisLock');
const sqlEconomy = require('./sqlEconomy');
const { walletRedisLockKey } = require('./walletLock');

const LOCK_TTL_MS = 5000;
const LOCK_TTL_SECONDS = Math.ceil(LOCK_TTL_MS / 1000);

/**
 * Coarse monetization source for Wallet Transaction rows (reporting / DSAR).
 * @param {string} [refType]
 * @returns {'AD'|'GIFT'|'SUBSCRIPTION'|'SHOP'|'COIN_PURCHASE'|'PPV'|'TICKET'|'AUCTION'|'ADMIN'|'OTHER'}
 */
function mapRefTypeToSource(refType) {
  const r = String(refType || '').toLowerCase();
  if (r.includes('gift')) return 'GIFT';
  if (r.includes('sub')) return 'SUBSCRIPTION';
  if (r.includes('ad')) return 'AD';
  if (r.includes('shop') || r.includes('order')) return 'SHOP';
  if (r.includes('coin')) return 'COIN_PURCHASE';
  if (r.includes('ppv')) return 'PPV';
  if (r.includes('ticket')) return 'TICKET';
  if (r.includes('auction')) return 'AUCTION';
  if (r.includes('admin')) return 'ADMIN';
  return 'OTHER';
}

async function syncMongoWalletBalance(userId, balanceCents, opts = {}) {
  const update = {
    balanceCents: Number(balanceCents || 0),
    updatedAt: new Date(),
  };
  if (opts.lifetimeEarningsDelta) {
    update.$inc = { lifetimeEarnings: Number(opts.lifetimeEarningsDelta) };
  }
  if (update.$inc) {
    await db.Wallet.findOneAndUpdate(
      { userId },
      { $set: { balanceCents: update.balanceCents, updatedAt: update.updatedAt }, $inc: update.$inc },
      { upsert: true, new: true }
    );
    return db.Wallet.findOne({ userId });
  }
  return db.Wallet.findOneAndUpdate(
    { userId },
    { $set: update },
    { upsert: true, new: true }
  );
}

async function getOrCreateWallet(userId) {
  if (sqlEconomy.isSqlEnabled()) {
    const sw = await sqlEconomy.getOrCreateWalletSql(userId);
    if (sw) {
      await syncMongoWalletBalance(userId, sw.balance_cents || 0).catch(() => {});
      const mw = await db.Wallet.findOne({ userId });
      if (mw) return mw;
    }
  }
  let w = await db.Wallet.findOne({ userId });
  if (!w) w = await db.Wallet.create({ userId, balanceCents: 0, lockedCents: 0 });
  return w;
}

async function getBalance(userId) {
  if (sqlEconomy.isSqlEnabled()) {
    const sqlBalance = await sqlEconomy.getBalanceSql(userId).catch(() => null);
    if (sqlBalance != null) return sqlBalance;
  }
  const w = await getOrCreateWallet(userId);
  return w.balanceCents;
}

async function doCredit(userId, amountCents, refType, refId, meta = {}) {
  const sqlMode = sqlEconomy.isSqlEnabled();
  const w = await getOrCreateWallet(userId);
  const user = await db.User.findById(userId).select('creatorStatus').lean().catch(() => null);
  let balanceAfter;
  if (sqlMode) {
    const sqlRes = await sqlEconomy.creditWalletSql(userId, amountCents, {
      refType,
      refId,
      meta,
      lifetimeEarningsDelta: user?.creatorStatus === 'approved' ? amountCents : 0,
    });
    balanceAfter = sqlRes.balanceCents;
    await syncMongoWalletBalance(
      userId,
      balanceAfter,
      user?.creatorStatus === 'approved' ? { lifetimeEarningsDelta: amountCents } : {}
    ).catch(() => {});
  } else {
    w.balanceCents += amountCents;
    await w.save();
    balanceAfter = w.balanceCents;
  }
  const pendingEarnings = meta.pendingEarnings === true || meta.skipCreatorWallet === true;
  if (user?.creatorStatus === 'approved' && !pendingEarnings) {
    creatorWallet.creditCreator(userId, amountCents, refType, refId).catch(() => {});
  }
  await ledger.appendEntry({
    type: 'credit',
    actorId: userId,
    amountCents,
    balanceAfterCents: balanceAfter,
    refType,
    refId,
    meta,
  });
  await writeFinancialAuditLog({
    action: 'WALLET_CREDIT',
    walletId: w?._id,
    amountCents,
    balanceAfterCents: balanceAfter,
    refType,
    refId,
    actorId: userId,
    meta,
  });
  if (w?._id) {
    await db.Transaction.create({
      walletId: w._id,
      type: refType || 'credit',
      direction: 'credit',
      source: mapRefTypeToSource(refType),
      status: 'completed',
      amountCents,
      refId,
      meta,
    });
  }
  return { balanceCents: balanceAfter };
}

async function credit(userId, amountCents, refType, refId, meta = {}) {
  if (amountCents <= 0) throw new Error('INVALID_AMOUNT');
  if (sqlEconomy.isSqlEnabled()) {
    return doCredit(userId, amountCents, refType, refId, meta);
  }
  const key = walletRedisLockKey(userId);
  try {
    return await redisLock.withLock(key, () => doCredit(userId, amountCents, refType, refId, meta), LOCK_TTL_SECONDS);
  } catch (e) {
    if (e && (e.message === 'Concurrent operation' || e.message === 'LOCK_NOT_ACQUIRED')) throw e;
    return await doCredit(userId, amountCents, refType, refId, meta);
  }
}

async function doDebit(userId, amountCents, refType, refId, meta) {
  const sqlMode = sqlEconomy.isSqlEnabled();
  let w = await db.Wallet.findOne({ userId });
  let balanceAfter;
  if (sqlMode) {
    const sqlRes = await sqlEconomy.debitWalletSql(userId, amountCents, {
      refType,
      refId,
      meta,
    });
    balanceAfter = sqlRes.balanceCents;
    w = await syncMongoWalletBalance(userId, balanceAfter).catch(() => w);
  } else {
    w = await db.Wallet.findOneAndUpdate(
      { userId, balanceCents: { $gte: amountCents } },
      { $inc: { balanceCents: -amountCents } },
      { new: true }
    );
    if (!w) throw new Error('INSUFFICIENT_BALANCE');
    balanceAfter = w.balanceCents;
  }
  await ledger.appendEntry({
    type: 'debit',
    actorId: userId,
    amountCents: -amountCents,
    balanceAfterCents: balanceAfter,
    refType,
    refId,
    meta,
  });
  await writeFinancialAuditLog({
    action: 'WALLET_DEBIT',
    walletId: w?._id,
    amountCents: -amountCents,
    balanceAfterCents: balanceAfter,
    refType,
    refId,
    actorId: userId,
    meta,
  });
  if (w?._id) {
    await db.Transaction.create({
      walletId: w._id,
      type: refType || 'debit',
      direction: 'debit',
      source: mapRefTypeToSource(refType),
      status: 'completed',
      amountCents: -amountCents,
      refId,
      meta,
    });
  }
  return { balanceCents: balanceAfter };
}

async function debit(userId, amountCents, refType, refId, meta = {}) {
  if (amountCents <= 0) throw new Error('INVALID_AMOUNT');
  const key = walletRedisLockKey(userId);
  try {
    return await redisLock.withLock(key, () => doDebit(userId, amountCents, refType, refId, meta), LOCK_TTL_SECONDS);
  } catch (e) {
    if (e && (e.message === 'Concurrent operation' || e.message === 'LOCK_NOT_ACQUIRED')) throw e;
    return await doDebit(userId, amountCents, refType, refId, meta);
  }
}

module.exports = { getBalance, credit, debit, getOrCreateWallet, mapRefTypeToSource };
