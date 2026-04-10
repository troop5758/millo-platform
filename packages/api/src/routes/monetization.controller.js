/**
 * Monetization Controller — process events, trigger upsells.
 * https://milloapp.com
 */
const db = require('@millo/database');
const monetization = require('@millo/monetization');
const { validateId } = require('../lib/validateId');

async function processEvent(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

  const body = request.body || {};
  const { userId, creatorId, eventType, amount, currency, refType, refId, meta } = body;

  if (!userId || !eventType || amount == null) {
    return reply.status(400).send({ error: 'USER_ID_EVENT_TYPE_AMOUNT_REQUIRED' });
  }
  if (!db.MonetizationEvent.EVENT_TYPES?.includes(eventType)) {
    return reply.status(400).send({ error: 'INVALID_EVENT_TYPE' });
  }
  if (!validateId(userId, reply)) return;
  if (creatorId && !validateId(creatorId, reply)) return;

  const event = await db.MonetizationEvent.create({
    userId,
    creatorId: creatorId || null,
    eventType,
    amount: Number(amount),
    currency: currency || 'USD',
    refType: refType || null,
    refId: refId ? String(refId) : null,
    meta: meta && typeof meta === 'object' ? meta : {},
  });

  const upsells = await monetization.funnelService.triggerUpsell({
    event_type: eventType,
    creator_id: creatorId,
  });

  return reply.send({
    success: true,
    event: event.toObject(),
    upsells,
  });
}

async function listFunnels(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const status = request.query?.status || 'active';
  const funnels = await monetization.funnelService.getFunnels(user._id, status);
  return reply.send({ funnels });
}

async function createFunnel(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const body = request.body || {};
  const { triggerEvent, upsellType, targetContentId, price, sortOrder } = body;
  if (!triggerEvent || !upsellType) {
    return reply.status(400).send({ error: 'TRIGGER_AND_TYPE_REQUIRED' });
  }
  if (!db.UpsellFunnel.UPSELL_TYPES?.includes(upsellType)) {
    return reply.status(400).send({ error: 'INVALID_UPSELL_TYPE' });
  }
  if (targetContentId && !validateId(targetContentId, reply)) return;
  try {
    const funnel = await monetization.funnelService.createUpsellFunnel(user._id, {
      triggerEvent,
      upsellType,
      targetContentId: targetContentId || null,
      price: price != null ? Number(price) : 0,
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    });
    return reply.status(201).send({ funnel });
  } catch (e) {
    if (e.message === 'TRIGGER_AND_TYPE_REQUIRED') return reply.status(400).send({ error: e.message });
    throw e;
  }
}

async function updateFunnel(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const { funnelId } = request.params;
  if (!validateId(funnelId, reply)) return;
  const funnel = await db.UpsellFunnel.findById(funnelId).lean();
  if (!funnel) return reply.status(404).send({ error: 'FUNNEL_NOT_FOUND' });
  if (String(funnel.creatorId) !== String(user._id)) {
    return reply.status(403).send({ error: 'FORBIDDEN' });
  }
  const body = request.body || {};
  const patch = {};
  if (body.triggerEvent != null) patch.triggerEvent = body.triggerEvent;
  if (body.upsellType != null) {
    if (!db.UpsellFunnel.UPSELL_TYPES?.includes(body.upsellType)) {
      return reply.status(400).send({ error: 'INVALID_UPSELL_TYPE' });
    }
    patch.upsellType = body.upsellType;
  }
  if (body.targetContentId != null) patch.targetContentId = body.targetContentId || null;
  if (body.price != null) patch.price = Number(body.price);
  if (body.sortOrder != null) patch.sortOrder = Number(body.sortOrder);
  if (body.isActive != null) patch.isActive = Boolean(body.isActive);
  if (Object.keys(patch).length === 0) {
    return reply.send({ funnel: { ...funnel, ...patch } });
  }
  const updated = await db.UpsellFunnel.findByIdAndUpdate(funnelId, { $set: patch }, { new: true }).lean();
  return reply.send({ funnel: updated });
}

async function deleteFunnel(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const { funnelId } = request.params;
  if (!validateId(funnelId, reply)) return;
  const funnel = await db.UpsellFunnel.findById(funnelId);
  if (!funnel) return reply.status(404).send({ error: 'FUNNEL_NOT_FOUND' });
  if (String(funnel.creatorId) !== String(user._id)) {
    return reply.status(403).send({ error: 'FORBIDDEN' });
  }
  await db.UpsellFunnel.findByIdAndDelete(funnelId);
  return reply.send({ ok: true });
}

async function getFanAnalytics(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const creatorId = user._id;
  const limit = Math.min(Number(request.query?.limit) || 20, 50);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [topBySpend, topGiftSenders, segmentCounts] = await Promise.all([
    db.MonetizationEvent.aggregate([
      { $match: { creatorId, createdAt: { $gte: d30 } } },
      { $group: { _id: '$userId', totalCents: { $sum: '$amount' } } },
      { $sort: { totalCents: -1 } },
      { $limit: limit },
    ]),
    db.LedgerEntry.aggregate([
      { $match: { type: 'debit', refType: 'gift', 'meta.receiverId': String(creatorId), createdAt: { $gte: d30 } } },
      { $group: { _id: '$actorId', totalCoins: { $sum: { $abs: '$amountCents' } } } },
      { $sort: { totalCoins: -1 } },
      { $limit: limit },
    ]),
    db.MonetizationEvent.aggregate([
      { $match: { creatorId, createdAt: { $gte: d30 } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
    ]),
  ]);

  const userIds = [...new Set([...topBySpend.map((r) => r._id), ...topGiftSenders.map((r) => r._id)])];
  const profiles = await db.Profile.find({ userId: { $in: userIds } }).lean();
  const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));

  const spendMap = Object.fromEntries(topBySpend.map((r) => [String(r._id), r.totalCents]));
  const giftMap = Object.fromEntries(topGiftSenders.map((r) => [String(r._id), r.totalCoins]));

  const coinConv = monetization.coinConversionService;
  const topFans = userIds.map((uid) => {
    const p = profileMap[String(uid)];
    const cents = spendMap[String(uid)] ?? 0;
    const coins = giftMap[String(uid)] ?? 0;
    const coinsAsCents = coinConv?.convertCoinsToCents?.(coins) ?? Math.round((coins || 0) * 6.5);
    return {
      userId: String(uid),
      displayName: p?.displayName || 'Fan',
      totalSpentCents: cents + coinsAsCents,
      totalCoins: coins,
      totalCents: cents,
    };
  }).sort((a, b) => (b.totalSpentCents || 0) - (a.totalSpentCents || 0)).slice(0, limit);

  const eventBreakdown = segmentCounts.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  return reply.send({
    topFans,
    eventBreakdown,
  });
}

async function listLiveTickets(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const status = request.query?.status || 'all';
  const tickets = await monetization.liveTicketService.getLiveTickets(user._id, status);
  return reply.send({ tickets });
}

async function getCreatorRevenue(request, reply) {
  const user = request.user;
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  const { startDate, endDate } = request.query || {};
  const revenue = await monetization.analyticsService.calculateCreatorRevenue(user._id, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  let ppvAnalytics = { summary: {} };
  try {
    ppvAnalytics = await require('@millo/ppv').analyticsService?.getCreatorPpvAnalytics?.(user._id, startDate, endDate) ?? ppvAnalytics;
  } catch (_) {}
  return reply.send({
    revenueCents: revenue,
    conversionRate: ppvAnalytics?.summary?.conversionRate ?? null,
    purchaseCount: ppvAnalytics?.summary?.purchaseCount ?? 0,
  });
}

module.exports = {
  processEvent,
  listFunnels,
  createFunnel,
  updateFunnel,
  deleteFunnel,
  getFanAnalytics,
  listLiveTickets,
  getCreatorRevenue,
};
