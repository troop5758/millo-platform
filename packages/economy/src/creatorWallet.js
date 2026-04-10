'use strict';
/**
 * Phase 5 — Creator Wallet. Syncs with Wallet for creators.
 * balance, pending_balance, withdrawable_balance, last_payout.
 * https://milloapp.com
 */
const db = require('@millo/database');

const HOLD_DAYS = 7; // earnings held for 7 days before withdrawable

async function getOrCreateCreatorWallet(creatorId) {
  let cw = await db.CreatorWallet.findOne({ creatorId });
  if (!cw) {
    const wallet = await db.Wallet.findOne({ userId: creatorId });
    const balance = wallet?.balanceCents ?? 0;
    cw = await db.CreatorWallet.create({
      creatorId,
      balance,
      currency: 'USD',
      pendingBalance: 0,
      withdrawableBalance: balance,
      payoutThresholdCents: 1000,
    });
  }
  return cw;
}

async function getCreatorWallet(creatorId) {
  const cw = await db.CreatorWallet.findOne({ creatorId }).lean();
  if (cw) return cw;
  const wallet = await db.Wallet.findOne({ userId: creatorId }).lean();
  return {
    creatorId,
    balance: wallet?.balanceCents ?? 0,
    currency: 'USD',
    pendingBalance: 0,
    withdrawableBalance: wallet?.balanceCents ?? 0,
    lastPayout: null,
    payoutThresholdCents: 1000,
  };
}

/**
 * Credit creator wallet (call after coins.credit for creators).
 * Adds to balance; new earnings go to pending, become withdrawable after hold period.
 */
async function creditCreator(creatorId, amountCents, refType, refId) {
  if (amountCents <= 0) return;
  const cw = await getOrCreateCreatorWallet(creatorId);
  cw.balance = (cw.balance || 0) + amountCents;
  // For simplicity: add to pending; a background job moves pending→withdrawable after HOLD_DAYS
  // MVP: treat all as withdrawable (pending=0)
  cw.pendingBalance = cw.pendingBalance ?? 0;
  cw.withdrawableBalance = Math.max(0, cw.balance - cw.pendingBalance);
  await cw.save();
  return { balance: cw.balance, withdrawableBalance: cw.withdrawableBalance };
}

/**
 * Sync CreatorWallet from Wallet (e.g. after credit or for reconciliation).
 */
async function syncFromWallet(creatorId) {
  const wallet = await db.Wallet.findOne({ userId: creatorId });
  const balance = wallet?.balanceCents ?? 0;
  const cw = await db.CreatorWallet.findOneAndUpdate(
    { creatorId },
    {
      $set: {
        balance,
        withdrawableBalance: balance,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  return cw;
}

/**
 * Debit creator wallet (e.g. gift reversal). Deducts from balance and withdrawable.
 */
async function debitCreator(creatorId, amountCents, refType, refId) {
  if (amountCents <= 0) return;
  const cw = await db.CreatorWallet.findOne({ creatorId });
  if (!cw) return;
  const available = cw.withdrawableBalance ?? cw.balance ?? 0;
  const deduct = Math.min(amountCents, available);
  if (deduct <= 0) return;
  cw.balance = Math.max(0, (cw.balance ?? 0) - deduct);
  cw.withdrawableBalance = Math.max(0, (cw.withdrawableBalance ?? 0) - deduct);
  await cw.save();
  return { balance: cw.balance, withdrawableBalance: cw.withdrawableBalance };
}

/**
 * Record payout — deduct from balance and update lastPayout.
 * No-op if CreatorWallet doesn't exist (legacy creators).
 */
async function recordPayout(creatorId, amountCents) {
  let cw = await db.CreatorWallet.findOne({ creatorId });
  if (!cw) {
    const wallet = await db.Wallet.findOne({ userId: creatorId });
    if (!wallet || wallet.balanceCents < amountCents) return null;
    cw = await db.CreatorWallet.create({
      creatorId,
      balance: wallet.balanceCents,
      currency: 'USD',
      pendingBalance: 0,
      withdrawableBalance: wallet.balanceCents,
      payoutThresholdCents: 1000,
    });
  }
  const available = cw.withdrawableBalance ?? cw.balance ?? 0;
  if (available < amountCents) return cw;
  cw.balance = Math.max(0, (cw.balance ?? 0) - amountCents);
  cw.withdrawableBalance = Math.max(0, (cw.withdrawableBalance ?? 0) - amountCents);
  cw.lastPayout = new Date();
  await cw.save();
  return cw;
}

module.exports = {
  getOrCreateCreatorWallet,
  getCreatorWallet,
  creditCreator,
  debitCreator,
  syncFromWallet,
  recordPayout,
  HOLD_DAYS,
};
