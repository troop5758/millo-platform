/**
 * PPV Bundle Service — create and manage PPV bundles.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');
const pricingService = require('./ppv.pricing.service');

/**
 * Grant access to a single content item (used by bundle unlock).
 */
async function grantAccess(userId, creatorId, contentId, opts) {
  const { method = 'bundle', amount = 0, bundleId } = opts || {};
  const amountCents = typeof amount === 'number' ? Math.round(amount) : 0;
  const existing = await db.PpvContentPurchase.findOne({ userId, contentId });
  if (existing) return existing.toObject();
  const purchase = await db.PpvContentPurchase.create({
    userId,
    contentId,
    creatorId,
    amountCents,
    meta: { method, bundleId: bundleId || null, purchaseType: 'bundle' },
  });
  return purchase.toObject();
}

/**
 * Grant access to a stream (used by bundle unlock).
 */
async function grantStreamAccess(userId, creatorId, streamId, opts) {
  const { method = 'bundle', amount = 0, bundleId } = opts || {};
  const amountCents = typeof amount === 'number' ? Math.round(amount) : 0;
  const existing = await db.PpvPurchase.findOne({ userId, streamId });
  if (existing) return existing.toObject();
  const purchase = await db.PpvPurchase.create({
    userId,
    streamId,
    creatorId,
    amountCents,
    meta: { method, bundleId: bundleId || null, purchaseType: 'bundle' },
  });
  return purchase.toObject();
}

/**
 * Unlock bundle — grant access to all content and streams in bundle.
 * Call after payment is confirmed.
 */
async function unlockBundle(userId, bundle) {
  const contentIds = bundle.contentIds || bundle.content_ids || [];
  const streamIds = bundle.streamIds || bundle.stream_ids || [];
  const creatorId = bundle.creatorId || bundle.creator_id;
  const amountCents = bundle.bundlePriceCents ?? bundle.priceCents ?? (bundle.bundle_price_usd ? Math.round(bundle.bundle_price_usd * 100) : 0);
  const totalItems = contentIds.length + streamIds.length;
  const perItemCents = totalItems > 0 ? Math.round(amountCents / totalItems) : 0;
  const bundleId = bundle._id?.toString() || bundle.id;

  const results = [];
  for (const contentId of contentIds) {
    const purchase = await grantAccess(userId, creatorId, contentId, {
      method: 'bundle',
      amount: perItemCents,
      bundleId,
    });
    results.push({ contentId, type: 'content', purchase });
  }
  for (const streamId of streamIds) {
    const purchase = await grantStreamAccess(userId, creatorId, streamId, {
      method: 'bundle',
      amount: perItemCents,
      bundleId,
    });
    results.push({ streamId, type: 'stream', purchase });
  }
  return results;
}

async function createBundle(creatorId, opts) {
  const { name, title, description, streamIds, contentIds, priceCents, bundlePriceCents } = opts || {};
  const price = priceCents ?? bundlePriceCents ?? 0;
  const ids = contentIds || streamIds || [];
  if ((!name && !title) || !Array.isArray(ids) || ids.length === 0) {
    throw new Error('TITLE_AND_CONTENT_REQUIRED');
  }
  if (!pricingService.validatePrice(price)) {
    throw new Error('INVALID_PRICE');
  }
  if (contentIds && contentIds.length > 0) {
    const contents = await db.PpvContent.find({ _id: { $in: contentIds }, creatorId, isActive: true }).lean();
    if (contents.length !== contentIds.length) {
      throw new Error('INVALID_CONTENT');
    }
  }
  if (streamIds && streamIds.length > 0) {
    const streams = await db.LiveStream.find({ _id: { $in: streamIds }, userId: creatorId }).lean();
    if (streams.length !== streamIds.length) {
      throw new Error('INVALID_STREAMS');
    }
  }
  const bundle = await db.PpvBundle.create({
    creatorId,
    title: String(title || name || '').slice(0, 200),
    name: String(name || title || '').slice(0, 200),
    description: (description || '').slice(0, 1000),
    contentIds: contentIds || [],
    streamIds: streamIds || [],
    bundlePriceCents: price,
    priceCents: price,
    status: 'active',
  });
  return bundle.toObject();
}

async function getBundle(bundleId) {
  const bundle = await db.PpvBundle.findById(bundleId).lean();
  return bundle;
}

async function listBundles(creatorId, status = 'active') {
  const query = { creatorId };
  if (status !== 'all') query.status = status;
  const bundles = await db.PpvBundle.find(query).sort({ createdAt: -1 }).lean();
  return bundles;
}

async function purchaseBundle(userId, bundleId) {
  const bundle = await db.PpvBundle.findById(bundleId);
  if (!bundle) throw new Error('BUNDLE_NOT_FOUND');
  if (bundle.status !== 'active') throw new Error('BUNDLE_NOT_AVAILABLE');
  if (bundle.creatorId.toString() === userId.toString()) throw new Error('OWNER_CANNOT_PURCHASE');

  const itemIds = [...(bundle.streamIds || []), ...(bundle.contentIds || [])];
  if (itemIds.length === 0) throw new Error('BUNDLE_EMPTY');

  const unlockService = require('./ppv.unlock.service');
  const streams = bundle.streamIds || [];
  let alreadyCount = 0;
  for (const streamId of streams) {
    const has = await unlockService.hasAccess(userId, streamId);
    if (has) alreadyCount++;
  }
  const contents = bundle.contentIds || [];
  if (streams.length > 0 && alreadyCount === streams.length && contents.length === 0) {
    return { bundle: bundle.toObject(), purchases: itemIds.map((id) => ({ id, alreadyHad: true })) };
  }

  const priceCents = bundle.priceCents || bundle.bundlePriceCents || 0;
  await economy.debit(userId, priceCents, 'ppv_bundle', bundleId.toString(), {
    bundleId: bundleId.toString(),
    streamIds: (bundle.streamIds || []).map(String),
  });
  const pricingService = require('./ppv.pricing.service');
  const creatorCents = pricingService.getCreatorCents
    ? await pricingService.getCreatorCents(bundle.creatorId, priceCents)
    : Math.round(priceCents * 0.75);
  await economy.credit(bundle.creatorId, creatorCents, 'ppv_bundle_revenue', bundleId.toString(), {
    bundleId: bundleId.toString(),
    buyerId: userId.toString(),
  });

  economy.recordPaymentTransaction?.({
    type: 'ppv',
    grossAmountCents: priceCents,
    platformFeeCents: priceCents - creatorCents,
    creatorAmountCents: creatorCents,
    userId,
    creatorId: bundle.creatorId,
    status: 'completed',
  }).catch(() => {});

  const unlockResults = await unlockBundle(userId, bundle);
  const totalItems = unlockResults.length;
  const purchases = unlockResults.map((r) => {
    if (r.type === 'content') {
      return { contentId: r.contentId, type: 'content', unlocked: true };
    }
    return { streamId: r.streamId, type: 'stream', unlocked: true };
  });

  await db.FinancialAuditLog.create({
    action: 'ppv_bundle_purchase',
    amountCents: priceCents,
    refType: 'PpvBundle',
    refId: bundleId.toString(),
    actorId: userId,
    meta: { bundleId: bundleId.toString(), creatorId: bundle.creatorId.toString(), itemCount: totalItems },
  });

  const economyMonetization = require('@millo/economy').monetizationEvents;
  if (economyMonetization?.recordMonetizationEvent) {
    economyMonetization.recordMonetizationEvent({
      userId,
      creatorId: bundle.creatorId,
      eventType: 'ppv_purchase',
      amount: priceCents,
      currency: 'USD',
      refType: 'PpvBundle',
      refId: bundleId.toString(),
      meta: { itemCount: totalItems },
    }).catch(() => {});
  }

  return { bundle: bundle.toObject(), purchases };
}

module.exports = {
  createBundle,
  getBundle,
  listBundles,
  purchaseBundle,
  grantAccess,
  grantStreamAccess,
  unlockBundle,
};
