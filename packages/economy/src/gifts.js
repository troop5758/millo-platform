/**
 * Gifts — live monetization: viewer spends wallet balance → creator earns per CreatorTier live split + optional platform wallet.
 * Uses `pricing.splitRevenueByCreator(receiverId, gross, 'live')` (default ~75% creator / 25% platform fee from tier).
 * Gift reversal: restore sender, claw back creator + platform shares using `meta.giftSplit` on the original debit.
 * https://milloapp.com
 */
const db = require('@millo/database');
const coins = require('./coins');
const creatorWallet = require('./creatorWallet');
const pricing = require('./pricing');
const { recordPaymentTransaction } = require('./paymentTransaction');
const sqlEconomy = require('./sqlEconomy');

/**
 * Preview live gift settlement for caps / UI (same split as sendGift).
 * @param {string|import('mongoose').Types.ObjectId} receiverId
 * @param {number} amountCents
 * @returns {Promise<{ platformCents: number, creatorCents: number }>}
 */
async function computeGiftSplit(receiverId, amountCents) {
  const g = Math.floor(Number(amountCents));
  if (!Number.isFinite(g) || g <= 0) {
    return { platformCents: 0, creatorCents: 0 };
  }
  return pricing.splitRevenueByCreator(receiverId, g, 'live');
}

/**
 * @param {string|import('mongoose').Types.ObjectId} senderId
 * @param {string|import('mongoose').Types.ObjectId} receiverId
 * @param {number} amountCents — gross deducted from sender
 * @param {string} refId — e.g. gift catalog id
 * @param {object} [meta] — streamId, giftId, ip, pendingEarnings (free creators), deviceFingerprint, etc.
 * @returns {Promise<{ balanceCents: number, giftSplit: { creatorCents: number, platformCents: number, grossCents: number } }>}
 */
async function sendGift(senderId, receiverId, amountCents, refId, meta = {}) {
  const gross = Math.floor(Number(amountCents));
  if (!Number.isFinite(gross) || gross <= 0) throw new Error('INVALID_AMOUNT');

  const split = await pricing.splitRevenueByCreator(receiverId, gross, 'live');
  const { pendingEarnings, ...metaRest } = meta;
  const giftSplit = {
    creatorCents: split.creatorCents,
    platformCents: split.platformCents,
    grossCents: gross,
  };
  const enrichedMeta = { ...metaRest, giftSplit };

  const debitResult = await coins.debit(senderId, gross, 'gift', refId, {
    ...enrichedMeta,
    receiverId: receiverId?.toString(),
  });

  try {
    if (split.creatorCents > 0) {
      await coins.credit(receiverId, split.creatorCents, 'gift', refId, {
        ...enrichedMeta,
        senderId: senderId?.toString(),
        pendingEarnings: pendingEarnings === true,
      });
    }
  } catch (creditErr) {
    await coins.credit(senderId, gross, 'gift_refund', refId, {
      ...enrichedMeta,
      reason: 'receiver_credit_failed',
    }).catch(() => {});
    throw creditErr;
  }

  const platformUid = process.env.PLATFORM_WALLET_USER_ID;
  if (split.platformCents > 0 && platformUid) {
    await coins.credit(platformUid, split.platformCents, 'gift_platform', refId, {
      ...enrichedMeta,
      senderId: senderId?.toString(),
      receiverId: receiverId?.toString(),
    }).catch(() => {});
  }

  if (sqlEconomy.isSqlEnabled()) {
    sqlEconomy.insertGiftTransactionSql({
      senderId,
      receiverId,
      streamId: meta.streamId || null,
      amountCents: gross,
      giftId: meta.giftId || null,
      refId,
      status: 'completed',
      meta: { ...meta, giftSplit },
    }).catch(() => {});
  }
  recordPaymentTransaction({
    type: 'gift',
    grossAmountCents: gross,
    platformFeeCents: split.platformCents,
    creatorAmountCents: split.creatorCents,
    userId: senderId,
    creatorId: receiverId,
    status: 'completed',
  }).catch(() => {});
  const monetizationEvents = require('./monetizationEvents');
  if (monetizationEvents?.recordMonetizationEvent) {
    monetizationEvents.recordMonetizationEvent({
      userId: senderId,
      creatorId: receiverId,
      eventType: 'gift',
      amount: gross,
      currency: 'coins',
      refType: 'gift',
      refId: refId ? String(refId) : null,
      meta: { ...meta, giftSplit },
    }).catch(() => {});
  }
  return { ...debitResult, giftSplit };
}

/**
 * Reverse a gift (admin). Finds debit LedgerEntry, credits sender, debits receiver,
 * reverses creator earnings, flags sender. Idempotent: throws if already reversed.
 * @param {string} ledgerEntryId - _id of the debit LedgerEntry (refType: gift)
 * @param {string} adminId - Admin user _id (for audit)
 * @returns {{ ok: boolean, senderId: string, receiverId: string, amountCents: number }}
 */
async function reverseGift(ledgerEntryId, adminId) {
  const entry = await db.LedgerEntry.findById(ledgerEntryId).lean();
  if (!entry) throw new Error('LEDGER_ENTRY_NOT_FOUND');
  if (entry.refType !== 'gift' || entry.type !== 'debit') throw new Error('NOT_A_GIFT_DEBIT');

  const alreadyReversed = await db.LedgerEntry.findOne({
    refType: 'gift_reversal',
    'meta.originalLedgerEntryId': String(ledgerEntryId),
  }).lean();
  if (alreadyReversed) throw new Error('ALREADY_REVERSED');

  const senderId = entry.actorId;
  const receiverId = entry.meta?.receiverId;
  if (!senderId || !receiverId) throw new Error('INVALID_GIFT_ENTRY');
  const amountCents = Math.abs(entry.amountCents || 0);
  if (amountCents <= 0) throw new Error('INVALID_AMOUNT');
  const gs = entry.meta?.giftSplit;
  let creatorDebit;
  let platformDebit = 0;
  if (gs && (gs.creatorCents != null || gs.platformCents != null)) {
    creatorDebit = Math.max(0, Math.floor(Number(gs.creatorCents) || 0));
    platformDebit = Math.max(0, Math.floor(Number(gs.platformCents) || 0));
  } else {
    creatorDebit = Math.floor(amountCents * 0.8);
  }
  const refId = `gift_reversal_${ledgerEntryId}`;
  const meta = { originalLedgerEntryId: String(ledgerEntryId), adminId: adminId?.toString() };

  await coins.credit(senderId, amountCents, 'gift_reversal', refId, { ...meta, receiverId: String(receiverId) });
  if (creatorDebit > 0) {
    await coins.debit(receiverId, creatorDebit, 'gift_reversal', refId, { ...meta, senderId: String(senderId) });
  }

  const platformUid = process.env.PLATFORM_WALLET_USER_ID;
  if (platformDebit > 0 && platformUid) {
    await coins.debit(platformUid, platformDebit, 'gift_reversal', refId, {
      ...meta,
      senderId: String(senderId),
      receiverId: String(receiverId),
    }).catch(() => {});
  }

  const creator = await db.User.findById(receiverId).select('creatorStatus').lean().catch(() => null);
  if (creator?.creatorStatus === 'approved' && creatorDebit > 0) {
    creatorWallet.debitCreator(receiverId, creatorDebit, 'gift_reversal', refId).catch(() => {});
  }

  recordPaymentTransaction({
    type: 'gift',
    grossAmountCents: amountCents,
    platformFeeCents: platformDebit,
    creatorAmountCents: creatorDebit,
    userId: senderId,
    creatorId: receiverId,
    status: 'refunded',
  }).catch(() => {});

  await db.User.findByIdAndUpdate(senderId, {
    $set: {
      'flags.fraudFlagged': true,
      'flags.giftReversedAt': new Date(),
      'flags.giftReversedLedgerEntryId': String(ledgerEntryId),
    },
  }).catch(() => {});

  return { ok: true, senderId: String(senderId), receiverId: String(receiverId), amountCents };
}

module.exports = { sendGift, reverseGift, computeGiftSplit };
