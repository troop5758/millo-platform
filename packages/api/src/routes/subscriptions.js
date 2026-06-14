'use strict';
/**
 * Subscription products CRUD — creator subscription tiers exposed as products.
 *
 * POST   /subscriptions/products       — create (auth: creator or admin)
 * GET    /subscriptions/products       — list (optional ?creatorId=)
 * PATCH  /subscriptions/products/:id   — update (auth: creator or admin)
 * DELETE /subscriptions/products/:id   — deactivate (sets active: false; auth: creator or admin)
 *
 * User subscription CRUD (Subscription documents) + regional list price:
 * GET    /api/subscriptions, /subscriptions           — current user’s subscriptions
 * GET    /api/subscriptions/:id, /subscriptions/:id    — one (owner)
 * POST   /api/subscriptions, /subscriptions            — create (regional price: US $10 else $5)
 * PATCH  /api/subscriptions/:id, /subscriptions/:id    — update (e.g. status cancelled)
 * DELETE /api/subscriptions/:id, /subscriptions/:id    — remove (owner)
 *
 * Schema mapping: tierName <-> name, price <-> priceMonthlyCents, benefits <-> features.
 * Backed by SubscriptionTier. https://milloapp.com
 */
const db = require('@millo/database');
const { validateId } = require('../lib/validateId');
const { writeFinancialAuditLog } = require('../services/auditLog');
const {
  resolveRegionFromRequest,
  regionalSubscriptionPriceUsd,
  regionalSubscriptionPriceCents,
} = require('../lib/subscriptionRegionalPricing');

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

function toProductShape(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  const pm = d.priceMonthlyCents != null ? Number(d.priceMonthlyCents) : 0;
  const pa =
    d.priceAnnualCents != null ? Number(d.priceAnnualCents) : Math.round(pm * 10);
  return {
    id: d._id,
    creatorId: d.creatorId,
    tierName: d.name,
    tierId: d.tierId,
    price: pm / 100,
    priceMonthlyCents: pm,
    priceAnnualCents: pa,
    priceAnnual: pa / 100,
    currency: d.currency || 'USD',
    benefits: Array.isArray(d.features) ? d.features : [],
    stripePriceIdMonthly: d.stripePriceIdMonthly || null,
    stripePriceIdAnnual: d.stripePriceIdAnnual || null,
    active: d.active !== false,
    sortOrder: d.sortOrder,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function subscriptionsRoutes(app) {
  /* ── POST /subscriptions/products ── */
  app.post('/subscriptions/products', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { creatorId, tierName, price, priceAnnual, benefits } = request.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    const name = tierName != null ? String(tierName).trim() : '';
    if (!name) return reply.status(400).send({ error: 'tierName required' });
    const priceNum = price != null ? Number(price) : NaN;
    if (Number.isNaN(priceNum) || priceNum < 0) return reply.status(400).send({ error: 'price must be a non-negative number' });
    const priceMonthlyCents = Math.round(priceNum * 100);
    let priceAnnualCents = null;
    if (priceAnnual != null && priceAnnual !== '') {
      const pa = Number(priceAnnual);
      if (!Number.isNaN(pa) && pa >= 0) priceAnnualCents = Math.round(pa * 100);
    }
    if (priceAnnualCents == null) priceAnnualCents = Math.round(priceMonthlyCents * 10);
    const features = Array.isArray(benefits) ? benefits.map((b) => String(b).trim()).filter(Boolean) : [];

    const isCreator = String(user._id) === String(creatorId);
    const isAdmin = user.role === 'admin';
    if (!isCreator && !isAdmin) return reply.status(403).send({ error: 'FORBIDDEN' });

    const tierId = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'tier';
    const existing = await db.SubscriptionTier.findOne({ creatorId, tierId });
    if (existing) return reply.status(409).send({ error: 'TIER_EXISTS', message: 'A tier with this name already exists' });

    const count = await db.SubscriptionTier.countDocuments({ creatorId });
    const tier = await db.SubscriptionTier.create({
      creatorId,
      tierId,
      name,
      priceMonthlyCents,
      priceAnnualCents,
      features,
      sortOrder: count,
      active: true,
    });
    return reply.status(201).send(toProductShape(tier));
  });

  /* ── GET /subscriptions/products ── */

  /* ── GET /subscriptions/products/:id ── */
  app.get('/subscriptions/products/:id', async (request, reply) => {
    const { id } = request.params;
    if (!id || !validateId(id, reply)) return;
    const tier = await db.SubscriptionTier.findById(id).lean();
    if (!tier) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send(toProductShape(tier));
  });

  /* ── PATCH /subscriptions/products/:id ── */
 app.patch('/subscriptions/products/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { id } = request.params;
    if (!id || !validateId(id, reply)) return;
    const tier = await db.SubscriptionTier.findById(id);
    if (!tier) return reply.status(404).send({ error: 'NOT_FOUND' });

    const isCreator = String(user._id) === String(tier.creatorId);
    const isAdmin = user.role === 'admin';
    if (!isCreator && !isAdmin) return reply.status(403).send({ error: 'FORBIDDEN' });

    const { tierName, price, priceAnnual, benefits, stripePriceIdMonthly, stripePriceIdAnnual, active } = request.body ?? {};
    if (tierName !== undefined) tier.name = String(tierName).trim() || tier.name;
    if (price !== undefined) tier.priceMonthlyCents = Math.round(Number(price) * 100);
    if (priceAnnual !== undefined) {
      tier.priceAnnualCents =
        priceAnnual == null || priceAnnual === '' ? null : Math.round(Number(priceAnnual) * 100);
    }
    if (benefits !== undefined) tier.features = Array.isArray(benefits) ? benefits.map((b) => String(b).trim()).filter(Boolean) : tier.features;
    if (stripePriceIdMonthly !== undefined) tier.stripePriceIdMonthly = stripePriceIdMonthly || null;
    if (stripePriceIdAnnual !== undefined) tier.stripePriceIdAnnual = stripePriceIdAnnual || null;
    if (active !== undefined) tier.active = Boolean(active);
    await tier.save();
    return reply.send(toProductShape(tier));
  });
  
  /* ── DELETE /subscriptions/products/:id ── */
  app.delete('/subscriptions/products/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { id } = request.params;
    if (!id || !validateId(id, reply)) return;
    const tier = await db.SubscriptionTier.findById(id);
    if (!tier) return reply.status(404).send({ error: 'NOT_FOUND' });

    const isCreator = String(user._id) === String(tier.creatorId);
    const isAdmin = user.role === 'admin';
    if (!isCreator && !isAdmin) return reply.status(403).send({ error: 'FORBIDDEN' });

    await db.SubscriptionTier.findByIdAndUpdate(id, { $set: { active: false, updatedAt: new Date() } });
    return reply.status(200).send({ ok: true, deactivated: true, product: toProductShape(await db.SubscriptionTier.findById(id).lean()) });
  });

  /* ── User Subscription CRUD (/api/subscriptions + /subscriptions) ── */
    for (const route of ['/api/subscriptions', '/subscriptions']) {
    app.get(route, async (request, reply) => {  

    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const region = resolveRegionFromRequest(request);
    const list = await db.Subscription.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();
    return reply.send({
      subscriptions: list.map((row) => toSubscriptionApiShape(row, region)),
    });
  });
  }

   for (const route of ['/api/subscriptions/:id', '/subscriptions/:id']) {
   app.get(route, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { id } = request.params;
    if (!id || !validateId(id, reply)) return;

    const region = resolveRegionFromRequest(request);
    const row = await db.Subscription.findOne({
      _id: id,
      userId: user._id,
    }).lean();

    if (!row) {
      return reply.status(404).send({ error: 'NOT_FOUND' });
    }

    return reply.send({
      subscription: toSubscriptionApiShape(row, region),
    });
  });
 }
  /* ── User Subscription CRUD ── */
    const subPaths = [
    '/api/subscriptions',
    '/subscriptions',
  ];
  app.post(subPaths, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { plan, creatorId: rawCreatorId } = request.body ?? {};
    const planStr = plan != null ? String(plan).trim() : '';
    if (!planStr) return reply.status(400).send({ error: 'plan required' });

    let creatorId = null;
    if (rawCreatorId != null && rawCreatorId !== '') {
      if (!validateId(rawCreatorId, reply)) return;
      creatorId = rawCreatorId;
    }

    const region = resolveRegionFromRequest(request);
    const priceCents = regionalSubscriptionPriceCents(region);

    const dup = await db.Subscription.findOne({
      userId: user._id,
      plan: planStr,
      creatorId: creatorId || null,
      status: 'active',
    }).lean();
    if (dup) {
      return reply.status(409).send({ error: 'ALREADY_SUBSCRIBED', subscription: toSubscriptionApiShape(dup, region) });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sub = await db.Subscription.create({
      userId: user._id,
      creatorId,
      plan: planStr,
      status: 'active',
      priceCents,
      startsAt: now,
      endsAt,
      meta: {
        ...(request.body?.meta && typeof request.body.meta === 'object' ? request.body.meta : {}),
        region,
        regionalPricingVersion: 1,
      },
    });

    await writeFinancialAuditLog({
      action: 'subscription_created',
      actorId: user._id,
      amountCents: priceCents,
      refType: 'subscription',
      refId: String(sub._id),
      meta: { plan: planStr, region, creatorId: creatorId ? String(creatorId) : null },
    });

    return reply.status(201).send({ subscription: toSubscriptionApiShape(sub.toObject(), region) });
  });
  for (const route of ['/api/subscriptions/:id', '/subscriptions/:id']) {
  app.patch(route, async (request, reply) => {

      const user = await authUser(request);
      if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
      const { id } = request.params;
      if (!id || !validateId(id, reply)) return;
      const sub = await db.Subscription.findOne({ _id: id, userId: user._id });
      if (!sub) return reply.status(404).send({ error: 'NOT_FOUND' });

      const { status } = request.body ?? {};
      if (status === undefined) {
        return reply.status(400).send({ error: 'status required' });
      }
      const s = String(status).trim();
      if (!['active', 'cancelled', 'expired'].includes(s)) {
        return reply.status(400).send({ error: 'INVALID_STATUS' });
      }
      sub.status = s;
      await sub.save();

      const region = resolveRegionFromRequest(request);
      await writeFinancialAuditLog({
        action: 'subscription_updated',
        actorId: user._id,
        amountCents: sub.priceCents,
        refType: 'subscription',
        refId: String(sub._id),
        meta: { status: sub.status, region },
      });

      return reply.send({ subscription: toSubscriptionApiShape(sub.toObject(), region) });
     });
   }

  for (const route of ['/api/subscriptions/:id', '/subscriptions/:id']) {
  app.delete(route, async (request, reply) => {

      const user = await authUser(request);
      if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
      const { id } = request.params;
      if (!id || !validateId(id, reply)) return;
      const sub = await db.Subscription.findOne({ _id: id, userId: user._id }).lean();
      if (!sub) return reply.status(404).send({ error: 'NOT_FOUND' });

      await db.Subscription.deleteOne({ _id: id, userId: user._id });

      const region = resolveRegionFromRequest(request);
      await writeFinancialAuditLog({
        action: 'subscription_deleted',
        actorId: user._id,
        amountCents: sub.priceCents,
        refType: 'subscription',
        refId: String(sub._id),
        meta: { plan: sub.plan, region },
      });

      return reply.status(204).send();

      });
    }
   }

module.exports = { subscriptionsRoutes };
