/**
 * PPV Unlock Service — purchase/unlock access to paid streams.
 * Logs all financial mutations to FinancialAuditLog.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');
const pricingService = require('./ppv.pricing.service');

/**
 * Check if user has access to a paid stream (owner, subscriber, or purchased).
 */
async function hasAccess(userId, streamId) {
  if (!userId || !streamId) return false;
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) return false;
  if (stream.visibility !== 'paid') return true;
  if (stream.userId.toString() === userId.toString()) return true;
  const purchase = await db.PpvPurchase.findOne({ userId, streamId }).lean();
  if (purchase) return true;
  const sub = await db.Subscription.findOne({
    userId,
    creatorId: stream.userId,
    status: 'active',
    endsAt: { $gt: new Date() },
  }).lean();
  return !!sub;
}

/**
 * Purchase PPV access for a stream. Debits user, credits creator, creates PpvPurchase.
 */
async function unlockStream(userId, streamId) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.visibility !== 'paid') throw new Error('STREAM_NOT_PPV');
  if (stream.status !== 'live' && stream.status !== 'ended') throw new Error('STREAM_NOT_AVAILABLE');
  const creatorId = stream.userId;
  if (creatorId.toString() === userId.toString()) throw new Error('OWNER_CANNOT_PURCHASE');

  const existing = await db.PpvPurchase.findOne({ userId, streamId });
  if (existing) return existing.toObject();

  const priceCents = stream.priceCents || 0;
  if (priceCents <= 0) throw new Error('INVALID_PRICE');

  await economy.debit(userId, priceCents, 'ppv_purchase', streamId.toString(), {
    streamId: streamId.toString(),
    creatorId: creatorId.toString(),
  });
  const creatorCents = pricingService.getCreatorCents
    ? await pricingService.getCreatorCents(creatorId, priceCents)
    : Math.round(priceCents * 0.75);
  await economy.credit(creatorId, creatorCents, 'ppv_revenue', streamId.toString(), {
    streamId: streamId.toString(),
    buyerId: userId.toString(),
  });

  const purchase = await db.PpvPurchase.create({
    userId,
    streamId,
    creatorId,
    amountCents: priceCents,
    meta: { purchaseType: 'single' },
  });

  await db.FinancialAuditLog.create({
    action: 'ppv_purchase',
    amountCents: priceCents,
    refType: 'PpvPurchase',
    refId: purchase._id.toString(),
    actorId: userId,
    meta: { streamId: streamId.toString(), creatorId: creatorId.toString() },
  });

  const platformFeeCents = priceCents - creatorCents;
  economy.recordPaymentTransaction?.({
    type: 'ppv',
    grossAmountCents: priceCents,
    platformFeeCents,
    creatorAmountCents: creatorCents,
    userId,
    creatorId,
    status: 'completed',
  }).catch(() => {});

  const economyMonetization = require('@millo/economy').monetizationEvents;
  if (economyMonetization?.recordMonetizationEvent) {
    economyMonetization.recordMonetizationEvent({
      userId,
      creatorId,
      eventType: 'ppv_purchase',
      amount: priceCents,
      currency: 'USD',
      refType: 'PpvPurchase',
      refId: purchase._id.toString(),
      meta: { streamId: streamId.toString() },
    }).catch(() => {});
  }

  return purchase.toObject();
}

module.exports = { hasAccess, unlockStream };
