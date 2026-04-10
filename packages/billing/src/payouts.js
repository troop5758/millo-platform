/**
 * Payouts — admin approval flow; no duplicate payouts (idempotency).
 * Audit trail: FinancialAuditLog + AdminAuditLog. https://milloapp.com
 */
const db = require('@millo/database');
const { writeAdminAuditLog, writeFinancialAuditLog, writeAuditLog } = db;
const stripe = require('./stripe');
const paypal = require('./paypal');
const payoutService = require('./payoutService');
const { creatorWallet, appendEntry, upsertFromPayoutRequest, patchPayoutExternalId, withWalletLock } = require('@millo/economy');

async function requestPayout(userId, amountCents, provider, idempotencyKey) {
  const existing = await db.PayoutRequest.findOne({ idempotencyKey }).lean();
  if (existing) return existing;
  const doc = await db.PayoutRequest.create({
    userId,
    amountCents,
    provider,
    idempotencyKey,
    status: 'pending',
  });
  const o = doc.toObject();
  upsertFromPayoutRequest(doc).catch(() => {});
  return o;
}

async function approvePayout(payoutId, adminId, overrideReason) {
  const payout = await db.PayoutRequest.findById(payoutId);
  if (!payout) throw new Error('PAYOUT_NOT_FOUND');
  if (payout.status !== 'pending' && payout.status !== 'processing') throw new Error('PAYOUT_NOT_PENDING');
  payout.status = 'approved';
  payout.approvedBy = adminId;
  payout.approvedAt = new Date();
  await payout.save();
  await writeAdminAuditLog({
    action: 'PAYOUT_APPROVED',
    adminId,
    targetType: 'PayoutRequest',
    targetId: payoutId.toString(),
    overrideReason: overrideReason || null,
    meta: { userId: payout.userId.toString(), amountCents: payout.amountCents, provider: payout.provider },
  });
  let result;
  if (payout.provider === 'stripe_connect' || payout.provider === 'wise') {
    result = await payoutService.executePayout(payout.userId, payout.amountCents, payout.provider, {
      idempotencyKey: payout.idempotencyKey,
      currency: payout.meta?.currency || 'USD',
      payoutEmail: payout.meta?.payoutEmail,
      wiseProfileId: payout.meta?.wiseProfileId,
    });
    await withWalletLock(payout.userId, () => creatorWallet.recordPayout(payout.userId, payout.amountCents));
  } else if (payout.provider === 'stripe') {
    result = await stripe.createPayout(payout.amountCents, payout.idempotencyKey, { userId: payout.userId });
  } else {
    result = await paypal.createPayout(payout.amountCents, payout.idempotencyKey, { userId: payout.userId });
  }
  const user = await db.User.findById(payout.userId).select('creatorStatus').lean().catch(() => null);
  if (user?.creatorStatus === 'approved') {
    withWalletLock(payout.userId, () => creatorWallet.recordPayout(payout.userId, payout.amountCents)).catch(() => {});
  }
  payout.status = 'paid';
  payout.paidAt = new Date();
  payout.externalId = result?.id;
  await payout.save();
  patchPayoutExternalId(payout).catch(() => {});
  await writeFinancialAuditLog({
    action: 'PAYOUT_PAID',
    walletId: (await db.Wallet.findOne({ userId: payout.userId }).select('_id').lean())?._id,
    amountCents: payout.amountCents,
    refType: payout.provider,
    refId: payout.externalId,
    actorId: adminId,
    meta: { payoutId: payoutId.toString(), userId: payout.userId.toString() },
  });
  await writeAuditLog({
    action: 'PAYOUT_SENT',
    userId: payout.userId,
    actorId: adminId,
    resourceType: 'PayoutRequest',
    resourceId: payoutId.toString(),
    meta: {
      amountCents: payout.amountCents,
      provider: payout.provider,
      externalId: result?.id || null,
    },
  });
  return payout.toObject();
}

async function rejectPayout(payoutId, adminId, overrideReason) {
  const payout = await db.PayoutRequest.findById(payoutId);
  if (!payout || payout.status !== 'pending') throw new Error('PAYOUT_NOT_PENDING');
  payout.status = 'rejected';
  payout.approvedBy = adminId;
  payout.approvedAt = new Date();
  await payout.save();
  let walletAfter;
  await withWalletLock(payout.userId, async () => {
    walletAfter = await db.Wallet.findOneAndUpdate(
      { userId: payout.userId },
      { $inc: { balanceCents: payout.amountCents } },
      { new: true }
    );
    appendEntry({
      type: 'payout_refund',
      actorId: payout.userId,
      amountCents: payout.amountCents,
      refType: 'payout_reject',
      refId: String(payout._id),
      meta: { payoutId: String(payout._id), reason: overrideReason || 'Rejected by admin' },
    }).catch(() => {});
    await writeFinancialAuditLog({
      action: 'PAYOUT_REJECT_REFUND',
      walletId: walletAfter?._id,
      amountCents: payout.amountCents,
      balanceAfterCents: walletAfter?.balanceCents,
      refType: 'payout_reject',
      refId: String(payout._id),
      actorId: adminId,
      meta: { payoutId: String(payout._id), userId: String(payout.userId), reason: overrideReason || null },
    });
  });
  await writeAdminAuditLog({
    action: 'PAYOUT_REJECTED',
    adminId,
    targetType: 'PayoutRequest',
    targetId: payoutId.toString(),
    overrideReason: overrideReason || null,
    meta: { userId: payout.userId.toString(), amountCents: payout.amountCents },
  });
  return payout.toObject();
}

function getPendingPayouts() {
  return db.PayoutRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
}

/**
 * Batch approve multiple payouts. Processes sequentially; returns results per payout.
 * Phase 9: Payout batching.
 */
async function approvePayoutBatch(payoutIds, adminId, overrideReason) {
  const ids = Array.isArray(payoutIds) ? payoutIds : [payoutIds];
  const results = [];
  for (const id of ids) {
    try {
      const payout = await approvePayout(id, adminId, overrideReason);
      results.push({ payoutId: id, ok: true, payout });
    } catch (e) {
      results.push({ payoutId: id, ok: false, error: e.message });
    }
  }
  return { results, approved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

module.exports = { requestPayout, approvePayout, approvePayoutBatch, rejectPayout, getPendingPayouts };
