/**
 * PPV Mass Message Service — send locked content to subscribers.
 * Recipients must pay to unlock. Major revenue driver.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');

async function createMassMessage(creatorId, opts) {
  const { messageText, contentId, priceCents, recipientIds } = opts || {};
  if (!contentId || priceCents == null || priceCents < 0) {
    throw new Error('CONTENT_AND_PRICE_REQUIRED');
  }
  const content = await db.PpvContent.findById(contentId).lean();
  if (!content) throw new Error('CONTENT_NOT_FOUND');
  if (content.creatorId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');

  let recipients = Array.isArray(recipientIds) ? recipientIds : [];
  if (recipients.length === 0) {
    const subs = await db.Subscription.find({ creatorId, status: 'active' }).select('userId').lean();
    recipients = subs.map((s) => s.userId);
  }

  const msg = await db.PpvMassMessage.create({
    creatorId,
    messageText: String(messageText || '').slice(0, 2000),
    contentId,
    priceCents,
    recipients,
  });
  return msg.toObject();
}

async function sendMassMessage(messageId, notifyFn) {
  const msg = await db.PpvMassMessage.findById(messageId);
  if (!msg) throw new Error('MESSAGE_NOT_FOUND');
  if (msg.sentAt) return { sent: true, alreadySent: true, recipientCount: msg.recipients.length };

  const content = await db.PpvContent.findById(msg.contentId).lean();
  if (!content) throw new Error('CONTENT_NOT_FOUND');

  if (typeof notifyFn === 'function') {
    for (const uid of (msg.recipients || []).slice(0, 1000)) {
      try {
        await notifyFn(uid, {
          type: 'ppv_mass_message',
          title: 'New locked content',
          body: msg.messageText || `Pay $${(msg.priceCents / 100).toFixed(2)} to unlock`,
          meta: {
            messageId: msg._id.toString(),
            contentId: msg.contentId.toString(),
            priceCents: msg.priceCents,
          },
        });
      } catch (e) { /* ignore */ }
    }
  }
  msg.sentAt = new Date();
  await msg.save();
  return { sent: true, recipientCount: (msg.recipients || []).length };
}

async function hasContentAccess(userId, contentId) {
  if (!userId || !contentId) return false;
  const content = await db.PpvContent.findById(contentId).lean();
  if (!content) return false;
  if (content.creatorId.toString() === userId.toString()) return true;
  const purchase = await db.PpvContentPurchase.findOne({ userId, contentId }).lean();
  return !!purchase;
}

async function unlockContent(userId, contentId, opts) {
  const { messageId, priceCents: overridePrice } = opts || {};
  const content = await db.PpvContent.findById(contentId);
  if (!content) throw new Error('CONTENT_NOT_FOUND');
  if (content.creatorId.toString() === userId.toString()) throw new Error('OWNER_CANNOT_PURCHASE');

  const existing = await db.PpvContentPurchase.findOne({ userId, contentId });
  if (existing) return existing.toObject();

  let priceCents = overridePrice;
  if (priceCents == null && messageId) {
    const msg = await db.PpvMassMessage.findById(messageId).lean();
    if (msg) priceCents = msg.priceCents;
  }
  if (priceCents == null) priceCents = content.basePriceCents || 0;
  if (priceCents <= 0) throw new Error('INVALID_PRICE');

  await economy.debit(userId, priceCents, 'ppv_content', contentId.toString(), {
    contentId: contentId.toString(),
    creatorId: content.creatorId.toString(),
    messageId: messageId ? messageId.toString() : null,
  });
  const pricingService = require('./ppv.pricing.service');
  const creatorCents = pricingService.getCreatorCents
    ? await pricingService.getCreatorCents(content.creatorId, priceCents)
    : Math.round(priceCents * 0.75);
  await economy.credit(content.creatorId, creatorCents, 'ppv_content_revenue', contentId.toString(), {
    contentId: contentId.toString(),
    buyerId: userId.toString(),
  });

  economy.recordPaymentTransaction?.({
    type: 'ppv',
    grossAmountCents: priceCents,
    platformFeeCents: priceCents - creatorCents,
    creatorAmountCents: creatorCents,
    userId,
    creatorId: content.creatorId,
    status: 'completed',
  }).catch(() => {});

  const purchase = await db.PpvContentPurchase.create({
    userId,
    contentId,
    creatorId: content.creatorId,
    amountCents: priceCents,
    messageId: messageId ? messageId.toString() : null,
    meta: { purchaseType: 'mass_message' },
  });

  await db.FinancialAuditLog.create({
    action: 'ppv_content_purchase',
    amountCents: priceCents,
    refType: 'PpvContentPurchase',
    refId: purchase._id.toString(),
    actorId: userId,
    meta: { contentId: contentId.toString(), creatorId: content.creatorId.toString() },
  });

  const analytics = require('./ppv.analytics.service');
  analytics.recordContentPurchase(contentId, content.creatorId, priceCents).catch(() => {});

  const economyMonetization = require('@millo/economy').monetizationEvents;
  if (economyMonetization?.recordMonetizationEvent) {
    economyMonetization.recordMonetizationEvent({
      userId,
      creatorId: content.creatorId,
      eventType: 'ppv_purchase',
      amount: priceCents,
      currency: 'USD',
      refType: 'PpvContentPurchase',
      refId: purchase._id.toString(),
      meta: { contentId: contentId.toString(), messageId: messageId ? messageId.toString() : null },
    }).catch(() => {});
  }

  return purchase.toObject();
}

async function listMassMessages(creatorId, limit = 50) {
  const messages = await db.PpvMassMessage.find({ creatorId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('contentId', 'title thumbnailUrl basePriceCents contentType')
    .lean();
  return messages;
}

async function listReceivedMessages(userId, limit = 50) {
  const messages = await db.PpvMassMessage.find({ recipients: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('contentId', 'title thumbnailUrl basePriceCents contentType')
    .populate('creatorId', 'email displayName')
    .lean();
  const withAccess = await Promise.all(
    messages.map(async (m) => {
      const cid = m.contentId?._id || m.contentId;
      const hasAccess = cid ? await hasContentAccess(userId, cid) : false;
      return { ...m, hasAccess };
    })
  );
  return withAccess;
}

module.exports = {
  createMassMessage,
  sendMassMessage,
  hasContentAccess,
  unlockContent,
  listMassMessages,
  listReceivedMessages,
};
