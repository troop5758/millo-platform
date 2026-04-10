'use strict';
/**
 * Payments routes — coin purchases, subscription checkout, webhooks.
 *
 * POST /payments/coins/intent         → create Stripe PaymentIntent for coin pack
 * POST /payments/coins/confirm        → confirm purchase + credit coins to wallet
 * POST /payments/complete             → complete payment (platform fee, creator allocation)
 * POST /payments/payouts/withdraw      → request payout (amount in dollars)
 * POST /payments/payouts/batch        → admin: batch process payouts (pending → processing)
 * POST /payments/payouts/batch-claim  → admin: claim pending payouts (→ processing, with limit)
 * POST /payments/shop/buy-now         → single-product checkout (productId, qty)
 * POST /payments/shop/checkout        → cart checkout (items, shipping)
 * POST /payments/subscriptions/create → create Stripe Checkout Session for sub tier
 * POST /payments/subscriptions/stripe/creator → Stripe subscriptions.create for a creator SubscriptionTier (recurring)
 * POST /payments/webhooks/stripe      → Stripe webhook handler
 * POST /payments/webhooks/paypal      → PayPal webhook handler (verify-webhook-signature)
 * GET  /payments/lookup               → admin: search payments by user, creator, status, from, to (date range)
 * GET  /payments/search?reference=    → auth: same as reference lookup; response { ok, payment }
 * GET  /payments/reference/:ref       → auth: lookup payment by referenceId (user sees own, admin sees any)
 * GET  /payments/universal/:id        → auth: MoneyIndex first, then legacy chain (PaymentReference, Ledger, Order, …)
 * GET  /money/:id, GET /api/money/:id  → auth: MoneyIndex only (refId | providerId | source ObjectId)
 * GET  /payments/reconciliation      → admin/support: revenue, payouts, refunds, chargebacks for date range
 *
 * Global: when STRIPE_SECRET_KEY is unset, `paymentCapabilitiesGuard` (app bootstrap) returns 503 for
 * all `/payments/*`, `/payout/batch`, `/webhooks/stripe`, `/webhooks/wise` (and `/api/…` prefixes).
 *
 * Webhooks: registered from `src/payments/routes/webhooks.js` (after this module assigns `payments/bindings`).
 * Per-route rate limits (`WEBHOOK_RATE_LIMIT_*` env), Redis dedupe (`lib/webhookDedupe.js` when Redis is configured),
 * production audit on verify failures, `AuditLog` on first ingest. Optional BullMQ worker: `PAYMENTS_WEBHOOK_WORKER=true` + `START_WORKERS=true`.
 * https://milloapp.com
 */
const db             = require('@millo/database');
const stripe         = require('@millo/billing/src/stripe');
const { getStripe }  = stripe;
const { pricing, appendEntry, credit, currencyService, creatorWallet, recordPaymentTransaction } = require('@millo/economy');
const paymentRouter  = require('../services/paymentRouter');
const checkoutBreakdown = require('../services/checkoutBreakdown');
const taxService = require('../services/taxService');
const kycService = require('../services/kycService');
const payoutService = require('@millo/billing/src/payoutService');
const { rejectPayout } = require('@millo/billing/src/payouts');
const { verifyPayPalWebhookAsync } = require('@millo/billing/src/webhooks');
const { resolveSession } = require('./auth');
const { requireVerifiedUser } = require('../middleware/auth.middleware');
const { requirePayments } = require('../middleware/requirePayments');
const { requireCapability } = require('../core/control-plane');
const { writeAdminAuditLog, writeAuditLog } = require('../services/auditLog');
const { validateId } = require('../lib/validateId');
const { withWalletLock, withOrderedWalletLocks, LockContentionError } = require('../lib/walletLock');
const { logActivity } = require('../lib/activityService');
const fraudService = require('../services/fraudService');
const fraudPolicy = require('../services/fraud.service');
const commerceIntegrity = require('../services/commerceIntegrity.service');
const { sendCustomerEmail } = require('../lib/customerEmail');
const { notifyUser } = require('../lib/notifyUser');

/** Tiered policy gate (account age, failed payments, IP churn, bots, auction) — before full fraudService evaluation. */
async function enforceFraudPolicyGate(user, reply) {
  try {
    await fraudPolicy.assertPaymentTransactionAllowed(user._id);
    return true;
  } catch (e) {
    if (e && e.code === 'FRAUD_TRANSACTION_BLOCKED') {
      reply.status(403).send({ error: e.code, message: e.message || 'Transaction blocked' });
      return false;
    }
    throw e;
  }
}

/** Auto-restrict on high device risk before money movement (requires client deviceFingerprint). */
async function enforceDeviceRiskGate(user, deviceFingerprint, reply) {
  const fp = deviceFingerprint != null ? String(deviceFingerprint).trim() : '';
  if (!fp || fp.length < 8) return true;
  const deviceRiskEnforcement = require('../services/deviceRiskEnforcement');
  const out = await deviceRiskEnforcement.maybeRestrictUserForDeviceRisk(user, fp, 'payment');
  if (out.restricted) {
    reply.status(403).send({ error: 'DEVICE_RISK_BLOCKED', message: 'Suspicious device activity' });
    return false;
  }
  return true;
}

const ipReputation = require('../services/ipReputationService');
const paymentOrchestration = require('../services/paymentOrchestration');
const { handleCreatorPayoutRequest } = require('../services/creatorPayoutRequest.handler');
const { getProvider: getPaymentProvider } = require('../services/payments');
const paymentReferenceService = require('../services/paymentReferenceService');
const ledgerService = require('../services/ledger.service');
const financialIntegrity = require('../services/financialIntegrity');
const { appendProviderHeaders } = require('../lib/providerState');
const { validateCoinPackRegion } = require('../lib/validateCoinPackRegion');
const kafka = require('../services/kafkaEventBus');
const { trackEvent } = require('../server/services/analytics');
const revenueService = require('../services/revenue.service');
const creatorTierService = require('@millo/economy/src/creatorTier');
const crypto = require('crypto');
const { markWebhookFirstSeen } = require('../lib/webhookDedupe');
const webhookBindings = require('../payments/bindings');

function isMongoObjectIdString(s) {
  return s != null && typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

/** Build geo opts (ipCountry, accountCountry, cardCountry) for fraud evaluation. */
async function buildGeoOpts(request, userId, cardCountry) {
  const [ipCountry, profile] = await Promise.all([
    ipReputation.getIpCountry(request.ip, request.headers),
    db.Profile.findOne({ userId }).select('meta').lean(),
  ]);
  const accountCountry = profile?.meta?.country || profile?.meta?.preferredCountry || null;
  return { ipCountry: ipCountry || undefined, accountCountry: accountCountry || undefined, cardCountry: cardCountry || undefined };
}

/** Shared options for internal fraud eval + Sift (`optOutFingerprinting`, optional `currencyCode`). */
function buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts, more = {}) {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint,
    optOutFingerprinting: !!user?.optOutFingerprinting,
    ...geoOpts,
    ...more,
  };
}

/** Phase 5: Resolve coin pack (DB coin_packs or config) and user country. Returns { pack, userCountry } for regional validation. */
async function getPackAndUserCountry(request, userId, packId, bodyCountry) {
  const geo = await buildGeoOpts(request, userId, bodyCountry);
  const userCountry = geo.accountCountry || bodyCountry || request.region?.user_country || null;
  const dbPack = await db.CoinPack.findOne({ $or: [{ packId }, { _id: packId }] }).lean().catch(() => null);
  if (dbPack) {
    const pack = {
      id: dbPack.packId || String(dbPack._id),
      country: dbPack.country,
      priceCents: dbPack.price,
      localPriceCents: dbPack.price,
      currency: dbPack.currency,
      localCurrency: dbPack.currency,
      coins: dbPack.coins,
      bonusCoins: dbPack.bonusCoins || 0,
      label: dbPack.label,
    };
    return { pack, userCountry };
  }
  const cfg = bodyCountry ? pricing.getRegionConfig(bodyCountry) : pricing.getConfig();
  const configPack = cfg.coinPacks?.find((p) => p.id === packId);
  if (!configPack) return { pack: null, userCountry };
  const pack = {
    ...configPack,
    country: configPack.country || bodyCountry || userCountry,
  };
  return { pack, userCountry };
}

/** Platform Stripe Checkout subs — fraud check amount aligned to regional pricing config (not a fixed 999). */
function quotePlatformSubscriptionCents(tierIdRaw, annual, countryCode) {
  const tierKey = String(tierIdRaw || 'creator').toLowerCase();
  const cfg = pricing.getRegionConfig?.(countryCode) || pricing.getConfig?.() || {};
  const tiers = cfg.subscriptionTiers || [];
  let t = tiers.find((x) => String(x.id || '').toLowerCase() === tierKey);
  if (!t) t = tiers.find((x) => String(x.id) === 'creator') || tiers.find((x) => Number(x.priceMonthly) > 0 || Number(x.priceMonthlyCents) > 0);
  if (!t) return annual ? 4990 : 999;
  let monthlyCents;
  if (t.priceMonthlyCents != null) monthlyCents = Math.round(Number(t.priceMonthlyCents));
  else if (t.priceMonthly != null) monthlyCents = Math.round(Number(t.priceMonthly) * 100);
  else monthlyCents = 999;
  let annualCents;
  if (t.priceAnnualCents != null) annualCents = Math.round(Number(t.priceAnnualCents));
  else if (t.priceAnnual != null) annualCents = Math.round(Number(t.priceAnnual) * 100);
  else annualCents = monthlyCents * 10;
  return annual ? annualCents : monthlyCents;
}

// Per-route rate-limit configs for payment endpoints
const PAYMENT_RATE_LIMIT = {
  max: 20,
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many payment requests. Please try again later.' }),
};
const PAYOUT_RATE_LIMIT = {
  max: 3,
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many payout requests. Please try again later.' }),
};

/** Per-route limits for provider webhooks (high ceiling; Stripe/PayPal can burst). */
const WEBHOOK_RATE_LIMIT = {
  max: Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 500,
  timeWindow: process.env.WEBHOOK_RATE_LIMIT_WINDOW || '1 minute',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Webhook rate limit exceeded.' }),
};

const WEBHOOK_RAW_CONFIG = { rawBody: true, rateLimit: WEBHOOK_RATE_LIMIT };

function logWebhookVerifyFailedAudit(provider, request, error) {
  if (process.env.NODE_ENV !== 'production') return;
  writeAdminAuditLog({
    adminId: null,
    action: `${provider}_webhook_verify_failed`,
    targetType: provider,
    meta: { error: String(error || '') },
  }).catch((err) => request.log?.warn?.({ err }, `${provider} webhook verify audit skipped`));
}

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

/** Create Order from validated items, update inventory. Used by webhook and dev stub. Phase 10: customsMode (DAP/DDP). orderMeta optional (e.g. { couponId }). */
async function createOrderFromItems(userId, orderItems, totalCents, stripeSessionId, shippingAddress = {}, customsMode = 'DAP', orderMeta = {}) {
  const order = await db.Order.create({
    userId,
    items: orderItems.map((i) => ({
      productId:  i.productId,
      creatorId:  i.creatorId,
      name:       i.name,
      qty:        i.qty,
      priceCents: i.priceCents,
    })),
    totalCents,
    status:          'paid',
    stripeSessionId,
    shippingAddress,
    customsMode: ['DAP', 'DDP'].includes(customsMode) ? customsMode : 'DAP',
    meta: orderMeta,
  });

  for (const item of orderItems) {
    await db.Product.updateOne(
      { _id: item.productId, inventory: { $gte: 0 } },
      { $inc: { inventory: -item.qty, sold: item.qty } }
    );
  }

  const storeAnalyticsService = require('../services/storeAnalyticsService');
  storeAnalyticsService.recordOrderForStoreAnalytics(order).catch(() => {});

  logActivity(userId, 'purchase', order._id).catch(() => {});

  // Credit each creator with their share (platform fee retained)
  const byCreator = {};
  for (const item of orderItems) {
    const cid = String(item.creatorId);
    const gross = (item.priceCents || 0) * (item.qty || 1);
    byCreator[cid] = (byCreator[cid] || 0) + gross;
  }
  const monetizationEvents = require('@millo/economy').monetizationEvents;
  for (const [creatorId, grossCents] of Object.entries(byCreator)) {
    const { creatorCents } = pricing.splitRevenueByCreator
      ? await pricing.splitRevenueByCreator(creatorId, grossCents, 'shop')
      : pricing.splitRevenue(grossCents);
    if (creatorCents > 0) {
      await credit(creatorId, creatorCents, 'shop_order', String(order._id), {
        orderId: String(order._id),
        stripeSessionId: stripeSessionId || null,
      });
      recordPaymentTransaction?.({
        type: 'shop_purchase',
        grossAmountCents: grossCents,
        platformFeeCents: grossCents - creatorCents,
        creatorAmountCents: creatorCents,
        userId,
        creatorId,
        paymentProcessor: 'stripe',
        status: 'completed',
      }).catch(() => {});
    }
    if (monetizationEvents?.recordMonetizationEvent) {
      monetizationEvents.recordMonetizationEvent({
        userId,
        creatorId,
        eventType: 'shop_purchase',
        amount: grossCents,
        currency: 'USD',
        refType: 'Order',
        refId: String(order._id),
      }).catch(() => {});
    }
  }

  // Phase 4: Store tax record for compliance
  const taxRegion = shippingAddress?.country || 'US';
  const currency = (shippingAddress?.currency || 'USD').toUpperCase();
  try {
    const taxResult = ['IN', 'AU', 'NZ', 'CA', 'SG', 'MY'].includes(taxRegion?.toUpperCase())
      ? await taxService.calculateGST(totalCents, taxRegion, { currency })
      : await taxService.calculateVAT(totalCents, taxRegion, { currency });
    await taxService.storeTaxRecord({
      userId,
      creatorId: orderItems.length === 1 ? orderItems[0].creatorId : null,
      amountCents: totalCents,
      currency,
      taxAmount: taxResult.taxCents,
      taxRegion: taxRegion.toUpperCase(),
      vatRate: taxResult.vatRate ?? taxResult.gstRate ?? 0,
      refType: 'order',
      refId: String(order._id),
    });
  } catch (taxErr) {
    console.warn('[payments] Tax record storage failed (non-fatal):', taxErr?.message);
  }

  return order;
}

async function paymentsRoutes(app) {

  const { requireNoRiskLock, requireNotEnforcementRateLimited } = require('../middleware/riskLock');

  /* ── Create PaymentIntent for coin pack ── */
  app.post('/payments/coins/intent', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireNoRiskLock(request, reply)) return;
    if (!(await requireNotEnforcementRateLimited(request, reply))) return;
    if (!requireVerifiedUser(user, reply)) return;

    const { packId, country, deviceFingerprint } = request.body ?? {};
    if (!packId) return reply.status(400).send({ error: 'PACK_ID_REQUIRED' });

    const { pack, userCountry } = await getPackAndUserCountry(request, user._id, packId, country);
    if (!pack) return reply.status(400).send({ error: 'UNKNOWN_PACK' });
    const regionCheck = validateCoinPackRegion(pack, userCountry);
    if (!regionCheck.allowed) return reply.status(403).send({ error: regionCheck.error, message: regionCheck.message });

    const amountCents = pack.localPriceCents ?? pack.priceCents;
    const currency    = pack.localCurrency ?? 'usd';
    const idKey       = `${user._id}_${packId}_${Date.now()}`;

    const geoOpts = await buildGeoOpts(request, user._id, country);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts, {
      currencyCode: (pack.localCurrency ?? 'USD').toUpperCase().slice(0, 3),
    });
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, amountCents, { ...fraudOpts, refType: 'coin_pack', refId: packId });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const radarMeta = fraudService.getStripeRadarMetadata(user._id, fraudOpts);
    const result = await stripe.createPaymentIntent(amountCents, idKey, {
      userId: user._id, packId, currency, email: user.email,
      coins: pack.coins + (pack.bonusCoins || 0),
      radarMetadata: radarMeta,
    });

    return reply.send({ ok: true, ...result, pack: { id: pack.id, label: pack.label, totalCoins: pack.coins + pack.bonusCoins, amountCents } });
  });

  /* ── Confirm coin purchase (after frontend Stripe confirmation) ── */
  app.post('/payments/coins/confirm', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireNoRiskLock(request, reply)) return;
    if (!requireVerifiedUser(user, reply)) return;

    const { paymentIntentId, packId, country } = request.body ?? {};
    if (!packId) return reply.status(400).send({ error: 'PACK_ID_REQUIRED' });
    if (!paymentIntentId) {
      return reply.status(400).send({ error: 'PAYMENT_INTENT_REQUIRED' });
    }

    const { pack, userCountry } = await getPackAndUserCountry(request, user._id, packId, country);
    if (!pack) return reply.status(400).send({ error: 'UNKNOWN_PACK' });
    const regionCheck = validateCoinPackRegion(pack, userCountry);
    if (!regionCheck.allowed) return reply.status(403).send({ error: regionCheck.error, message: regionCheck.message });
    const totalCoins = pack.coins + (pack.bonusCoins || 0);

    const stripeClient = getStripe();
    if (!stripeClient) {
      return reply.status(503).send({ error: 'PAYMENTS_UNAVAILABLE', message: 'Stripe is not configured.' });
    }
    try {
      const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== 'succeeded') {
        return reply.status(402).send({ error: 'PAYMENT_NOT_SUCCEEDED', status: pi.status });
      }
      const already = await db.LedgerEntry.findOne({ refType: 'coin_purchase', refId: String(paymentIntentId) }).lean();
      if (already) return reply.send({ ok: true, coinsAdded: 0, packId, duplicate: true });
    } catch (e) {
      request.log.warn(e, 'Stripe PI verification failed');
      return reply.status(500).send({ error: 'STRIPE_VERIFICATION_FAILED' });
    }

    const lockTtlMs = Math.min(Number(process.env.WALLET_CREDIT_LOCK_MS) || 15_000, 60_000);
    let payload;
    try {
      payload = await financialIntegrity.executeMoneyOperation({
        userId: user._id,
        idempotencyKey: `coin_confirm_pi_${paymentIntentId}`,
        requireProviderLive: 'stripe',
        lockTtlMs,
        fn: async () => {
          const dupLedger = await db.LedgerEntry.findOne({ refType: 'coin_purchase', refId: String(paymentIntentId) }).lean();
          if (dupLedger) {
            return { ok: true, coinsAdded: 0, packId, duplicate: true };
          }
          const economy = require('@millo/economy');
          try {
            await economy.credit(
              user._id, totalCoins * 100,
              'coin_purchase', paymentIntentId,
              { packId, totalCoins }
            );
          } catch (creditErr) {
            request.log.error(
              { err: creditErr, userId: String(user._id), packId, totalCoins, paymentIntentId },
              'economy.credit() failed on coin_purchase'
            );
            if (process.env.NODE_ENV === 'production') {
              await writeAuditLog({
                action: 'COIN_PURCHASE_CREDIT_FAILED',
                actorId: user._id,
                resourceType: 'payment_intent',
                resourceId: String(paymentIntentId),
                meta: { packId, totalCoins, reason: creditErr?.message || 'economy.credit_failed' },
              }).catch(() => {});
              throw creditErr;
            }
            await withWalletLock(user._id, () =>
              db.Wallet.findOneAndUpdate(
                { userId: user._id },
                { $inc: { balanceCents: totalCoins } },
                { upsert: true }
              )
            ).catch((walletErr) => {
              request.log.error(
                { err: walletErr, userId: String(user._id), packId },
                'CRITICAL: economy.credit() and wallet fallback failed on coin_purchase'
              );
              throw walletErr;
            });
          }

          const amountCents = pack.priceCents ?? pack.localPriceCents ?? 0;
          await paymentReferenceService.upsertPaymentReference({
            provider: 'stripe',
            referenceId: paymentIntentId,
            userId: user._id,
            status: 'completed',
            amountCents,
            currency: pack.currency || pack.localCurrency || 'USD',
            metadata: { packId, totalCoins },
          }).catch(() => {});
          kafka.publish(kafka.TOPICS.PAYMENTS, {
            event: 'coins.purchased',
            userId: String(user._id),
            packId: String(packId),
            coinsAdded: totalCoins,
            paymentIntentId: paymentIntentId || null,
          }).catch(() => {});
          await writeAuditLog({
            action: 'COIN_PURCHASE_CONFIRMED',
            actorId: user._id,
            resourceType: 'payment_intent',
            resourceId: String(paymentIntentId),
            meta: { packId, coinsAdded: totalCoins },
          }).catch(() => {});
          return { ok: true, coinsAdded: totalCoins, packId };
        },
      });
    } catch (err) {
      if (err instanceof LockContentionError) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      if (err && err.code === 'IDEMPOTENT_REPLAY') {
        return reply.status(409).send({
          error: 'IDEMPOTENT_REPLAY',
          message: err.message || 'A prior attempt for this payment failed; contact support or use a new payment.',
        });
      }
      if (process.env.NODE_ENV === 'production') {
        return reply.status(503).send({
          error: 'COIN_CREDIT_UNAVAILABLE',
          message: 'Could not complete coin credit. Support has been notified; do not retry blindly.',
        });
      }
      throw err;
    }

    appendProviderHeaders(reply);
    return reply.send(payload);
  });

  /* ── Complete payment (Payment Controller) — processPayment with platform fee, creator allocation ── */
  app.post('/payments/complete', { config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const body = request.body ?? {};
    const creatorId = body.creatorId ?? body.creator_id;
    if (!creatorId) return reply.status(400).send({ error: 'CREATOR_ID_REQUIRED' });
    if (!validateId(creatorId, reply)) return;

    const amount = body.amount ?? body.amountCents;
    if (amount == null) return reply.status(400).send({ error: 'AMOUNT_REQUIRED' });

    const payerId = body.userId ?? body.user_id ?? user._id;
    const amountCents = amount != null ? Math.round(Number(amount) * 100) : null;
    const refId = body.refId ?? body.ref_id;
    const idempotencyKey =
      body.idempotencyKey ??
      body.idempotency_key ??
      (refId ? `payment_complete_${String(refId)}` : `payment_complete_${payerId}_${creatorId}_${amountCents}_${Date.now()}`);

    try {
      const transaction = await financialIntegrity.executeMoneyOperation({
        userId: payerId,
        idempotencyKey,
        fn: () => paymentOrchestration.processPayment({
          ...body,
          userId: payerId,
          creatorId,
        }),
      });
      return reply.send(transaction.toObject ? transaction.toObject() : transaction);
    } catch (err) {
      if (err && err.code === 'IDEMPOTENT_REPLAY') {
        return reply.status(409).send({
          error: 'IDEMPOTENT_REPLAY',
          message: err.message || 'A prior attempt for this payment failed.',
        });
      }
      request.log.warn({ err, body }, 'processPayment failed');
      const msg = err.message || 'PAYMENT_PROCESSING_FAILED';
      const integrity =
        err.name === 'FinancialIntegrityError' ||
        err.code === 'PAYMENTS_NOT_LIVE' ||
        err.code === 'PAYMENT_PROVIDER_NOT_LIVE';
      const status = integrity ? 503 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  /* ── Create Stripe Checkout for subscription ── */
  app.post('/payments/subscriptions/create', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { tierId, annual, deviceFingerprint } = request.body ?? {};
    const priceId = annual
      ? process.env[`STRIPE_PRICE_${String(tierId).toUpperCase()}_ANNUAL`]
      : process.env[`STRIPE_PRICE_${String(tierId).toUpperCase()}_MONTHLY`];

    if (!priceId) {
      return reply.status(400).send({
        error:   'STRIPE_PRICE_NOT_CONFIGURED',
        message: `Set STRIPE_PRICE_${String(tierId).toUpperCase()}_${annual ? 'ANNUAL' : 'MONTHLY'} env var with your Stripe Price ID.`,
      });
    }

    const userCountry = request.region?.user_country || 'US';
    const amountCents = quotePlatformSubscriptionCents(tierId, annual, userCountry);
    const geoOpts = await buildGeoOpts(request, user._id);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts);
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, amountCents, { ...fraudOpts, refType: 'subscription', refId: tierId });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const session = await stripe.createCheckoutSession(priceId, { userId: user._id, email: user.email });
    return reply.send(session);
  });

  /* ── Creator tier: Stripe Subscription API (recurring) — tier.stripePriceIdMonthly / stripePriceIdAnnual ── */
  app.post('/payments/subscriptions/stripe/creator', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { subscriptionTierId, annual, deviceFingerprint } = request.body ?? {};
    if (!subscriptionTierId) return reply.status(400).send({ error: 'SUBSCRIPTION_TIER_ID_REQUIRED' });
    if (!validateId(subscriptionTierId, reply)) return;

    const tier = await db.SubscriptionTier.findById(subscriptionTierId);
    if (!tier || tier.active === false) return reply.status(404).send({ error: 'TIER_NOT_FOUND' });

    const creatorId = tier.creatorId;
    const priceId = annual ? (tier.stripePriceIdAnnual || null) : (tier.stripePriceIdMonthly || null);
    if (!priceId) {
      return reply.status(400).send({
        error: 'STRIPE_PRICE_NOT_LINKED',
        message: 'This tier has no Stripe Price ID. Set stripePriceIdMonthly / stripePriceIdAnnual on the tier.',
      });
    }

    const amountCents = annual
      ? (tier.priceAnnualCents != null ? tier.priceAnnualCents : Math.round((tier.priceMonthlyCents || 0) * 10))
      : (tier.priceMonthlyCents || 0);

    const geoOpts = await buildGeoOpts(request, user._id);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts);
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, amountCents, { ...fraudOpts, refType: 'subscription', refId: String(tier._id) });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const existingStripeSub = await db.Subscription.findOne({
      userId: user._id, creatorId, status: 'active',
    }).lean();
    if (existingStripeSub) {
      return reply.status(400).send({ error: 'ALREADY_SUBSCRIBED', subscription: existingStripeSub });
    }

    const creatorTierRec = await creatorTierService.getCreatorTier(creatorId);
    const platformFeePercent = creatorTierRec.subscriptionPlatformFee ?? 25;
    const creatorSharePercent = Math.max(0, 100 - platformFeePercent);

    let stripeCustomer;
    try {
      stripeCustomer = await stripe.ensureStripeCustomerForUser(user);
    } catch (e) {
      request.log.error({ err: e }, 'ensureStripeCustomerForUser failed');
      return reply.status(503).send({ error: 'STRIPE_NOT_CONFIGURED', message: e.message || 'Stripe is not configured.' });
    }

    const useConnectFee = process.env.STRIPE_CREATOR_SUBSCRIPTION_APPLICATION_FEE === 'true';
    const meta = {
      type: 'creator_subscription',
      userId: String(user._id),
      creatorId: String(creatorId),
      tierId: tier.tierId,
      subscriptionTierId: String(tier._id),
      billingInterval: annual ? 'year' : 'month',
      platformFeePercent: String(platformFeePercent),
      creatorSharePercent: String(creatorSharePercent),
    };
    const idempotencyKey = `sub_creator_${user._id}_${tier._id}_${annual ? 'y' : 'm'}`;

    let created;
    try {
      created = await stripe.createSubscription({
        customerId: stripeCustomer.id,
        priceId,
        application_fee_percent: useConnectFee ? platformFeePercent : undefined,
        metadata: meta,
        idempotencyKey,
      });
    } catch (e) {
      request.log.error({ err: e }, 'createSubscription failed');
      return reply.status(400).send({ error: 'STRIPE_SUBSCRIPTION_ERROR', message: e.message || 'Subscription create failed' });
    }

    return reply.status(201).send({
      ok: true,
      subscriptionId: created.subscriptionId,
      status: created.status,
      clientSecret: created.clientSecret,
    });
  });

  /* ── Coin purchase via Stripe Checkout Session (redirect flow) ── */
  app.post('/payments/coins/checkout-session', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { packId, country, deviceFingerprint } = request.body ?? {};
    if (!packId) return reply.status(400).send({ error: 'PACK_ID_REQUIRED' });

    const { pack, userCountry } = await getPackAndUserCountry(request, user._id, packId, country);
    if (!pack) return reply.status(400).send({ error: 'UNKNOWN_PACK' });
    const regionCheck = validateCoinPackRegion(pack, userCountry);
    if (!regionCheck.allowed) return reply.status(403).send({ error: regionCheck.error, message: regionCheck.message });

    const amountCents = pack.localPriceCents ?? pack.priceCents;
    const currency    = (pack.localCurrency ?? 'USD').toLowerCase();
    const totalCoins  = pack.coins + pack.bonusCoins;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const geoOpts = await buildGeoOpts(request, user._id, country);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts, {
      currencyCode: (pack.localCurrency ?? 'USD').toUpperCase().slice(0, 3),
    });
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, amountCents, { ...fraudOpts, refType: 'coin_pack', refId: packId });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const priceId = process.env[`STRIPE_PRICE_COINS_${packId.toUpperCase()}`];
    let sessionResult;

    if (priceId) {
      // Use pre-created Stripe Price
      sessionResult = await stripe.createCheckoutSession(priceId, {
        userId: user._id, email: user.email,
        successUrl: `${frontendUrl}/coins/success?pack=${packId}&coins=${totalCoins}`,
        cancelUrl:  `${frontendUrl}/coins`,
        metadata:   { packId, totalCoins, userId: String(user._id) },
      });
    } else {
      // Dynamic price via PaymentIntent redirect (stub fallback when no Stripe keys)
      const idKey = `${user._id}_${packId}_${Date.now()}`;
      sessionResult = await stripe.createPaymentIntent(amountCents, idKey, {
        userId: user._id, packId, currency, email: user.email, coins: totalCoins,
        successUrl: `${frontendUrl}/coins/success?pack=${packId}&coins=${totalCoins}`,
      });
    }

    return reply.send({ ok: true, redirectUrl: sessionResult.url || sessionResult.clientSecret, pack: { id: pack.id, totalCoins, amountCents } });
  });

  /* ── Coin checkout (Phase 2: payment abstraction) — POST /payments/coin-checkout ── */
  app.post('/payments/coin-checkout', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireNoRiskLock(request, reply)) return;
    if (!(await requireNotEnforcementRateLimited(request, reply))) return;
    if (!requireVerifiedUser(user, reply)) return;

    const { priceId, packId, country, currency: bodyCurrency } = request.body ?? {};
    const { pack, userCountry } = packId ? await getPackAndUserCountry(request, user._id, packId, country) : { pack: null, userCountry: null };
    if (packId && pack) {
      const regionCheck = validateCoinPackRegion(pack, userCountry);
      if (!regionCheck.allowed) return reply.status(403).send({ error: regionCheck.error, message: regionCheck.message });
    }
    const amountCents = pack ? (pack.localPriceCents ?? pack.priceCents) : 0;
    const totalCoins = pack ? pack.coins + (pack.bonusCoins || 0) : 0;
    const currency = (bodyCurrency || (pack && (pack.localCurrency || 'USD')) || 'USD').toLowerCase();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const geoOpts = await buildGeoOpts(request, user._id, country);
    const fraudOpts = buildFraudRequestOpts(request, user, request.body?.deviceFingerprint, geoOpts, {
      currencyCode: (currency || 'USD').toUpperCase().slice(0, 3),
    });
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, request.body?.deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, amountCents, { ...fraudOpts, refType: 'coin_pack', refId: packId || 'coin-checkout' });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const stripeProvider = getPaymentProvider('stripe');
    const resolvedPriceId = priceId || (packId && process.env[`STRIPE_PRICE_COINS_${String(packId).toUpperCase()}`]);
    let result;
    try {
      result = await stripeProvider.createCheckout({
        priceId: resolvedPriceId,
        amountCents: resolvedPriceId ? undefined : amountCents,
        amount: resolvedPriceId ? undefined : amountCents / 100,
        currency,
        userId: user._id,
        email: user.email,
        metadata: packId && totalCoins ? { packId, totalCoins, userId: String(user._id) } : { userId: String(user._id) },
        successUrl: `${frontendUrl}/coins/success${packId ? `?pack=${packId}&coins=${totalCoins}` : ''}`,
        cancelUrl: `${frontendUrl}/coins`,
      });
    } catch (checkoutErr) {
      if (process.env.NODE_ENV === 'production') {
        request.log.error({ err: checkoutErr }, 'coin-checkout: Stripe checkout failed');
        return reply.status(503).send({
          error: 'PAYMENT_NOT_CONFIGURED',
          message: 'Payment processing is not available. Please contact support.',
        });
      }
      throw checkoutErr;
    }

    if (result.stub && process.env.NODE_ENV === 'production') {
      return reply.status(503).send({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Payment processing is not available. Please contact support.' });
    }
    if (result.stub) {
      // Dev stub: record pending purchase but DO NOT credit coins
      // Coins are ONLY credited via webhook (checkout.session.completed)
      if (packId && totalCoins) {
        try {
          await appendEntry(user._id, {
            type: 'pending_stub_purchase',
            amountCents,
            refType: 'coin_pack',
            refId: packId,
            meta: { totalCoins, env: process.env.NODE_ENV || 'development', source: 'coin-checkout-stub', status: 'pending_webhook' },
          });
        } catch (_) {}
      }
      request.log.warn({ userId: String(user._id), coins: totalCoins }, '[DEV STUB] Checkout created — coins will be credited via webhook only');
      trackEvent({
        name: 'payments.coin_checkout_initiated',
        userId: String(user._id),
        props: {
          packId: packId || null,
          amountCents,
          totalCoins: totalCoins || 0,
          sessionId: result.sessionId || null,
          stub: true,
        },
      }).catch(() => {});
      return reply.send({
        ok: true,
        stub: true,
        message: 'DEV: Coins will be credited when webhook is received. Use /payments/webhooks/stripe to simulate.',
        sessionId: result.sessionId,
        coinsExpected: totalCoins || 0,
        redirectUrl: null,
      });
    }

    trackEvent({
      name: 'payments.coin_checkout_initiated',
      userId: String(user._id),
      props: {
        packId: packId || null,
        amountCents,
        totalCoins: totalCoins || 0,
        sessionId: result.sessionId || null,
        stub: false,
      },
    }).catch(() => {});
    return reply.send({
      ok: true,
      url: result.url || null,
      sessionId: result.sessionId || null,
      clientSecret: result.clientSecret || null,
      paymentIntentId: result.paymentIntentId || null,
      redirectUrl: result.url || result.clientSecret || null,
    });
  });

  /* ── Creator subscription (coins-based) ── */
  app.post('/payments/subscriptions/creator', { config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { creatorId, deviceFingerprint } = request.body ?? {};
    if (!creatorId) return reply.status(400).send({ error: 'creatorId required' });
    if (!validateId(creatorId, reply)) return;

    // Resolve creator profile for price
    const creator = await db.User.findById(creatorId).lean();
    if (!creator) return reply.status(404).send({ error: 'CREATOR_NOT_FOUND' });

    const fraudService = require('../services/fraudService');
    if (await fraudService.hasSubscriptionFraudFlag(user._id)) {
      return reply.status(403).send({
        error: 'SUBSCRIPTION_FRAUD',
        message: 'Subscription is restricted due to policy.',
      });
    }
    if (deviceFingerprint) {
      const sameDevice = await fraudService.checkSameDeviceSubscription(user._id, creatorId, deviceFingerprint);
      if (!sameDevice.allowed) {
        await fraudService.flagSubscriptionFraud(user._id, sameDevice.reason || 'same_device', { creatorId: String(creatorId) });
        return reply.status(403).send({
          error: 'SUBSCRIPTION_FRAUD',
          message: 'Subscription not allowed. Same-device self-subscription is not permitted.',
        });
      }
      const farm = await fraudService.checkSubscriptionFarm(deviceFingerprint);
      if (!farm.allowed) {
        await fraudService.flagSubscriptionFraud(user._id, 'subscription_farm', { creatorId: String(creatorId), count: farm.count });
        return reply.status(403).send({
          error: 'SUBSCRIPTION_FRAUD',
          message: 'Subscription not allowed. Too many subscriptions from this device.',
        });
      }
    }
    const refundLoop = await fraudService.checkSubscriptionRefundLoop(user._id, creatorId);
    if (!refundLoop.allowed) {
      await fraudService.flagSubscriptionFraud(user._id, 'refund_loop', {
        creatorId: String(creatorId),
        subCount: refundLoop.subCount,
        refundCount: refundLoop.refundCount,
      });
      return reply.status(403).send({
        error: 'SUBSCRIPTION_FRAUD',
        message: 'Subscription not allowed. Repeated subscribe-refund pattern detected.',
      });
    }

    // Default sub price from platform settings (or 500 coins = $5)
    const cfg = pricing.getConfig();
    const priceCents = cfg?.creatorSubPriceCents ?? 500;

    let sub = null;
    let httpOut = null;

    try {
      await withOrderedWalletLocks([String(user._id), String(creatorId)], async () => {
        const existing = await db.Subscription.findOne({
          userId: user._id, creatorId, status: 'active',
        });
        if (existing) {
          httpOut = { status: 400, body: { error: 'ALREADY_SUBSCRIBED', subscription: existing } };
          return;
        }

        const wallet = await db.Wallet.findOne({ userId: user._id });
        if (!wallet) {
          httpOut = { status: 402, body: { error: 'NO_WALLET' } };
          return;
        }
        if (wallet.balanceCents < priceCents) {
          httpOut = {
            status: 402,
            body: { error: 'INSUFFICIENT_COINS', balance: wallet.balanceCents, required: priceCents },
          };
          return;
        }
        wallet.balanceCents -= priceCents;
        await wallet.save();

        const split = await revenueService.splitRevenueByCreator(creatorId, priceCents, 'subscription');
        const tierRow = await creatorTierService.getCreatorTier(creatorId);
        const platformFeePercent = tierRow.subscriptionPlatformFee ?? 25;
        const creatorSharePercent = Math.max(0, 100 - platformFeePercent);

        const now = new Date();
        const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const subDoc = await db.Subscription.create({
          userId: user._id,
          creatorId,
          plan: 'creator_monthly',
          priceCents,
          status: 'active',
          startsAt: now,
          endsAt,
          platformFeePercent,
          creatorSharePercent,
          meta: { funding: 'coins' },
        });

        try {
          await revenueService.creditWallet(creatorId, split.creatorCents, 'subscription', String(subDoc._id), {
            subscriberId: String(user._id),
            split: 'creator',
          });
          await revenueService.creditPlatform(split.platformCents, 'subscription', String(subDoc._id), {
            creatorId: String(creatorId),
            subscriberId: String(user._id),
          });
        } catch (creditErr) {
          await db.Subscription.deleteOne({ _id: subDoc._id }).catch(() => {});
          request.log.error(
            { err: creditErr, creatorId: String(creatorId), subscriberId: String(user._id), priceCents },
            'CRITICAL: subscription revenue credit failed after subscriber debit — rolling back subscriber wallet'
          );
          await db.Wallet.findOneAndUpdate(
            { userId: user._id },
            { $inc: { balanceCents: priceCents } },
          ).catch((rollbackErr) => request.log.error(
            { err: rollbackErr, userId: String(user._id), priceCents },
            'CRITICAL: subscriber wallet rollback also failed — manual reconciliation required'
          ));
          httpOut = {
            status: 500,
            body: { error: 'PAYMENT_PROCESSING_ERROR', message: 'Payment could not be completed. Your coins have been refunded.' },
          };
          return;
        }

        recordPaymentTransaction?.({
          type: 'subscription',
          grossAmountCents: priceCents,
          platformFeeCents: split.platformCents,
          creatorAmountCents: split.creatorCents,
          userId: user._id,
          creatorId,
          status: 'completed',
        }).catch(() => {});

        await appendEntry({
          type: 'subscription_debit',
          actorId: user._id,
          amountCents: -priceCents,
          refType: 'subscription',
          refId: String(subDoc._id),
          meta: {
            creatorId: String(creatorId),
            subId: String(subDoc._id),
            platformFeeCents: split.platformCents,
            creatorCents: split.creatorCents,
          },
        }).catch((err) => request.log.error({ err }, 'Failed to write subscription_debit ledger entry'));

        sub = subDoc;
      });
    } catch (lockErr) {
      if (lockErr instanceof LockContentionError) {
        return reply.status(409).send({ error: lockErr.code || 'REDIS_LOCK_HELD', message: lockErr.message });
      }
      throw lockErr;
    }

    if (httpOut) return reply.status(httpOut.status).send(httpOut.body);

    const { notifyUser } = require('../lib/notifyUser');
    const profile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
    const displayName = profile?.displayName || user.email?.split('@')[0] || 'Someone';
    await notifyUser(creatorId, { type: 'subscribe', title: 'New subscriber!', body: `${displayName} subscribed to your channel.`, meta: { subscriberId: String(user._id) } })
      .catch((err) => request.log.warn({ err }, 'Failed to notify creator of new subscriber'));

    return reply.send({ ok: true, subscription: sub.toObject() });
  });

  /* ── Subscription tiers (platform) ── */
  app.get('/payments/subscriptions/tiers', async (request, reply) => {
    const country = request.region?.user_country || request.query?.country || 'US';
    const cfg = pricing.getRegionConfig?.(country) || pricing.getConfig?.() || {};
    const tiers = cfg.subscriptionTiers || [];
    return reply.send({ tiers });
  });

  /* ── Subscription tiers for a creator (DB SubscriptionTier or platform fallback) ── */
  app.get('/payments/subscriptions/tiers/:creatorId', async (request, reply) => {
    const { creatorId } = request.params;
    if (!creatorId || !validateId(creatorId, reply)) return;
    const country = request.region?.user_country || request.query?.country || 'US';
    const cfg = pricing.getRegionConfig?.(country) || pricing.getConfig?.() || {};

    const dbTiers = await db.SubscriptionTier.find({ creatorId, active: true })
      .sort({ sortOrder: 1, tierId: 1 })
      .lean();

    if (dbTiers.length > 0) {
      const tiers = dbTiers.map((t) => ({
        id: t.tierId,
        tierId: t.tierId,
        name: t.name,
        price: (t.priceMonthlyCents || 0) / 100,
        priceMonthly: t.priceMonthlyCents,
        priceMonthlyCents: t.priceMonthlyCents,
        priceAnnual: t.priceAnnualCents ?? Math.round(t.priceMonthlyCents * 10),
        priceAnnualCents: t.priceAnnualCents ?? Math.round(t.priceMonthlyCents * 10),
        currency: t.currency || 'USD',
        features: t.features || [],
        benefits: t.features || [],
        badge: t.badge || null,
      }));
      return reply.send({ tiers });
    }

    const platformTiers = cfg.subscriptionTiers || [];
    const creatorTiers = platformTiers.filter((t) => t.id === 'free' || t.id === 'creator').map((t) => ({
      ...t,
      priceMonthly: t.id === 'creator' ? 499 : (t.priceMonthly || 0),
      priceAnnual: t.id === 'creator' ? 4990 : (t.priceAnnual || 0),
    }));
    return reply.send({ tiers: creatorTiers.length ? creatorTiers : platformTiers });
  });

  /* ── Creator: create subscription tier (auth, must own creatorId) ── */
  app.post('/payments/subscriptions/creators/:creatorId/tiers', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { creatorId } = request.params;
    if (!creatorId || creatorId !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const { tierId, name, price, priceMonthlyCents, priceAnnualCents, features, benefits, badge } = request.body ?? {};
    const featuresVal = Array.isArray(features) ? features : (Array.isArray(benefits) ? benefits : []);
    let monthlyCents = priceMonthlyCents != null ? Number(priceMonthlyCents) : null;
    if (monthlyCents == null && price != null) monthlyCents = Math.round(Number(price) * 100);
    if (!tierId || !name || monthlyCents == null) return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'tierId, name, and price or priceMonthlyCents required' });
    if (monthlyCents < 0) return reply.status(400).send({ error: 'INVALID_PRICE' });

    const existing = await db.SubscriptionTier.findOne({ creatorId, tierId });
    if (existing) return reply.status(409).send({ error: 'TIER_EXISTS', message: 'Tier id already exists' });

    const tier = await db.SubscriptionTier.create({
      creatorId,
      tierId: String(tierId).toLowerCase().replace(/\s/g, '_'),
      name,
      priceMonthlyCents: Math.round(monthlyCents),
      priceAnnualCents: priceAnnualCents != null ? Math.round(Number(priceAnnualCents)) : null,
      features: featuresVal,
      badge: badge || null,
      sortOrder: await db.SubscriptionTier.countDocuments({ creatorId }),
      active: true,
    });
    return reply.status(201).send({ ok: true, tier: tier.toObject() });
  });

  /* ── Creator: update subscription tier ── */
  app.patch('/payments/subscriptions/creators/:creatorId/tiers/:tierId', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { creatorId, tierId } = request.params;
    if (!creatorId || creatorId !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const tier = await db.SubscriptionTier.findOne({ creatorId, tierId });
    if (!tier) return reply.status(404).send({ error: 'TIER_NOT_FOUND' });

    const { name, price, priceMonthlyCents, priceAnnualCents, features, benefits, badge, active } = request.body ?? {};
    if (name !== undefined) tier.name = name;
    if (priceMonthlyCents !== undefined) tier.priceMonthlyCents = Math.round(Number(priceMonthlyCents));
    else if (price !== undefined) tier.priceMonthlyCents = Math.round(Number(price) * 100);
    if (priceAnnualCents !== undefined) tier.priceAnnualCents = priceAnnualCents == null ? null : Math.round(Number(priceAnnualCents));
    if (features !== undefined) tier.features = Array.isArray(features) ? features : tier.features;
    else if (benefits !== undefined) tier.features = Array.isArray(benefits) ? benefits : tier.features;
    if (badge !== undefined) tier.badge = badge;
    if (active !== undefined) tier.active = Boolean(active);
    await tier.save();
    return reply.send({ ok: true, tier: tier.toObject() });
  });

  /* ── Creator: list own tiers ── */
  app.get('/payments/subscriptions/creators/:creatorId/tiers', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { creatorId } = request.params;
    if (!creatorId || creatorId !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const tiers = await db.SubscriptionTier.find({ creatorId }).sort({ sortOrder: 1, tierId: 1 }).lean();
    return reply.send({ ok: true, tiers });
  });

  /* ── Check creator subscription status ── */
  app.get('/payments/subscriptions/creator/:creatorId', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const sub = await db.Subscription.findOne({
      userId: user._id, creatorId: request.params.creatorId, status: 'active',
    }).lean();
    return reply.send({ subscribed: !!sub, subscription: sub || null });
  });

  /* ── My subscriptions ── */
  app.get('/payments/subscriptions/my', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const subs = await db.Subscription.find({ userId: user._id })
      .sort({ createdAt: -1 }).lean();
    return reply.send({ subscriptions: subs });
  });

  /* ── Cancel subscription ── */
  app.post('/payments/subscriptions/cancel', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { subscriptionId } = request.body ?? {};
    const sub = subscriptionId
      ? await db.Subscription.findOne({ _id: subscriptionId, userId: user._id })
      : await db.Subscription.findOne({ userId: user._id, status: 'active' });

    if (!sub) return reply.status(404).send({ error: 'SUBSCRIPTION_NOT_FOUND' });
    if (sub.status !== 'active') return reply.status(400).send({ error: 'NOT_ACTIVE', status: sub.status });

    // Cancel on Stripe if externalId present
    const externalId = sub.meta?.externalId || sub.externalId;
    const stripeClient = getStripe();
    if (externalId && stripeClient) {
      try {
        await stripeClient.subscriptions.cancel(externalId);
      } catch (e) {
        request.log.warn({ err: e }, 'Stripe subscription cancel failed');
      }
    }

    sub.status  = 'cancelled';
    sub.endsAt  = sub.endsAt || new Date();
    await sub.save();

    await notifyUser(user._id, {
      type: 'subscriptionCancelled',
      title: 'Subscription cancelled',
      body: `Your ${sub.plan} plan has been cancelled and will end on ${new Date(sub.endsAt).toLocaleDateString()}.`,
      meta: { subscriptionId: String(sub._id), plan: sub.plan, endsAt: sub.endsAt },
    }).catch(() => null);

    return reply.send({ ok: true, subscription: sub.toObject() });
  });

  /* ── Request a creator payout (orchestration: KYC gate, audit) — shared with POST /payout/request ── */
  app.post(
    '/payments/payouts/request',
    { preHandler: [requireCapability('payouts')], config: { rateLimit: PAYOUT_RATE_LIMIT } },
    handleCreatorPayoutRequest
  );

  /* ── Withdraw (Payout Controller) — alias for payouts/request with amount in dollars ── */
  app.post(
    '/payments/payouts/withdraw',
    { preHandler: [requireCapability('payouts')], config: { rateLimit: PAYOUT_RATE_LIMIT } },
    async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireNoRiskLock(request, reply)) return;
    if (!(await requireNotEnforcementRateLimited(request, reply))) return;
    if (!requireVerifiedUser(user, reply)) return;
    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isPayoutEligible(user._id))) {
      return reply.status(403).send({
        error: 'MONETIZATION_SUSPENDED',
        message: 'Payout eligibility is restricted by your creator reputation score. Please contact support.',
      });
    }

    const { amount } = request.body ?? {};
    if (amount == null) return reply.status(400).send({ error: 'AMOUNT_REQUIRED' });
    const amountCents = Math.round(Number(amount) * 100);

    const payoutRisk = await fraudService.checkPayoutRisk(user._id, amountCents);
    if (!payoutRisk.allowed) {
      return reply.status(403).send({
        error: 'PAYOUT_HELD',
        message: 'Payout is held for risk review. Please contact support.',
        fraudScore: payoutRisk.fraudScore,
      });
    }

    const idemHeader =
      request.headers['idempotency-key'] ||
      request.headers['x-idempotency-key'] ||
      (request.body?.idempotencyKey != null ? String(request.body.idempotencyKey) : '');
    const payoutIdemKey = idemHeader
      ? `payout_withdraw_${user._id}_${idemHeader.slice(0, 200)}`
      : `payout_withdraw_${user._id}_${amountCents}_${Date.now()}`;

    let result;
    try {
      result = await financialIntegrity.executeMoneyOperation({
        userId: user._id,
        idempotencyKey: payoutIdemKey,
        requireProviderLive: 'stripe',
        fn: () => paymentOrchestration.requestCreatorPayout({
          creatorId: user._id,
          amountCents,
          provider: 'stripe',
          payoutRiskTier: payoutRisk.tier,
          holdUntil: payoutRisk.holdUntil || undefined,
        }),
      });
    } catch (err) {
      if (err && err.code === 'IDEMPOTENT_REPLAY') {
        return reply.status(409).send({
          error: 'IDEMPOTENT_REPLAY',
          message: err.message || 'A prior payout request failed for this idempotency key.',
        });
      }
      throw err;
    }

    if (!result.ok) {
      const status = result.error === 'KYC_REQUIRED' ? 403
        : result.error === 'PAYOUT_BLOCKED' ? 403
        : result.error === 'INSUFFICIENT_BALANCE' ? 402
        : result.error === 'PENDING_REQUEST_EXISTS' ? 409
        : 400;
      return reply.status(status).send({ error: result.error, message: result.message, ...result });
    }

    return reply.status(201).send(result.payout);
  });

  /* ── Payout history ── */
  app.get('/payments/payouts/history', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const payouts = await db.PayoutRequest.find({ userId: user._id })
      .sort({ createdAt: -1 }).limit(50).lean();
    return reply.send({ payouts });
  });

  /* ── User: recent ledger transactions ── */
  app.get('/payments/wallet/transactions', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const limit = Math.min(Number(request.query?.limit) || 30, 100);
    const entries = await db.LedgerEntry
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .catch(() => []);
    return reply.send({ transactions: entries });
  });

  /* ── Phase 5: Creator wallet ── */
  app.get('/payments/creator-wallet', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.creatorStatus !== 'approved') {
      return reply.status(403).send({ error: 'CREATOR_REQUIRED', message: 'Creator wallet is only available for approved creators.' });
    }
    const cw = await creatorWallet.getCreatorWallet(user._id);
    return reply.send({ wallet: cw });
  });

  /* ── Phase 5: Stripe Connect onboarding ── */
  app.post(
    '/payments/creator-wallet/stripe-connect',
    { preHandler: [requireCapability('payouts')], config: { rateLimit: PAYMENT_RATE_LIMIT } },
    async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;
    if (user.creatorStatus !== 'approved') return reply.status(403).send({ error: 'CREATOR_REQUIRED' });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const result = await payoutService.createStripeConnectAccount(
      user._id,
      user.email,
      `${frontendUrl}/dashboard?stripe=return`,
      `${frontendUrl}/dashboard?stripe=refresh`
    );
    return reply.send({ ok: true, ...result });
  });

  /* ── Phase 5: KYC verification ── */
  app.post(
    '/payments/kyc/start',
    { preHandler: [requireCapability('kyc')], config: { rateLimit: PAYMENT_RATE_LIMIT } },
    async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;
    const { returnUrl } = request.body ?? {};
    const result = await kycService.createVerificationSession(user._id, { returnUrl, email: user.email });
    return reply.send({ ok: true, ...result });
  });

  app.get('/payments/kyc/status', { preHandler: [requireCapability('kyc')] }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const status = await kycService.getKycStatus(user._id);
    return reply.send({ kyc: status });
  });

  app.post(
    '/payments/kyc/tax-form',
    { preHandler: [requireCapability('kyc')], config: { rateLimit: PAYMENT_RATE_LIMIT } },
    async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    await kycService.markTaxFormSubmitted(user._id);
    return reply.send({ ok: true });
  });

  /* ── Phase 6: KYC provider webhooks (Sumsub, Persona, Stripe Identity, Onfido) ── */
  async function kycWebhookHandler(request, reply) {
    const provider = String(request.params?.provider || '').toLowerCase();
    if (!['sumsub', 'persona', 'stripe_identity', 'onfido'].includes(provider)) {
      return reply.status(400).send({ error: 'UNSUPPORTED_PROVIDER' });
    }
    const kycWebhookBody = request.body || {};
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {});
    const kycDedupeKey = `${provider}:${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 48)}`;
    const { first: kycFirst } = await markWebhookFirstSeen('kyc', kycDedupeKey, Number(process.env.KYC_WEBHOOK_DEDUPE_TTL_SEC) || 3600);
    if (!kycFirst) {
      return reply.send({ ok: true, duplicate: true });
    }
    writeAuditLog({
      action: 'WEBHOOK_KYC_EVENT',
      resourceType: 'kyc_webhook',
      resourceId: provider,
      meta: { provider },
    }).catch((err) => request.log.warn({ err }, 'KYC webhook ingest audit skipped'));

    const result = await kycService.processWebhook(provider, kycWebhookBody, {
      headers: request.headers,
      rawBody,
    });
    if (!result.ok) {
      const code = result.error === 'INVALID_SIGNATURE' ? 401 : 400;
      return reply.status(code).send(result);
    }
    return reply.send({ ok: true, ...result });
  }

  app.post('/payments/kyc/webhook/:provider', { preHandler: [requireCapability('kyc')], config: { rateLimit: WEBHOOK_RATE_LIMIT } }, kycWebhookHandler);
  app.post('/webhooks/kyc/:provider', { preHandler: [requireCapability('kyc')], config: { rateLimit: WEBHOOK_RATE_LIMIT } }, kycWebhookHandler);

  /* ── Phase 4: Generate tax invoice ── */
  app.post('/payments/tax/invoice', { config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { amountCents, currency, taxRegion, creatorId, refType, refId, lineItems } = request.body ?? {};
    if (!amountCents || amountCents < 0 || !taxRegion) {
      return reply.status(400).send({ error: 'AMOUNT_AND_TAX_REGION_REQUIRED' });
    }
    const region = (taxRegion || 'US').toUpperCase();
    if (creatorId && !validateId(creatorId, reply)) return;

    try {
      const result = await taxService.generateInvoice({
        userId: user._id,
        creatorId: creatorId || null,
        amountCents: Math.round(Number(amountCents)),
        currency: currency || 'USD',
        taxRegion: region,
        refType: refType || null,
        refId: refId || null,
        lineItems: Array.isArray(lineItems) ? lineItems : [],
      });
      return reply.status(201).send({ ok: true, ...result });
    } catch (err) {
      return reply.status(500).send({ error: 'TAX_INVOICE_ERROR', message: err?.message });
    }
  });

  /* ── Admin: payout batch (manual trigger — pending → processing, finance teams) ── */
  async function payoutBatchHandler(request, reply) {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const result = await paymentOrchestration.processPayouts();
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'payout_batch',
      meta: { processed: result.processed, payoutIds: result.payoutIds || [] },
    });
    return reply.send({ ok: true, processed: result.processed });
  }

  app.post('/payments/payouts/batch', { preHandler: [requireCapability('payouts')] }, payoutBatchHandler);
  app.post('/payout/batch', { preHandler: [requireCapability('payouts')] }, payoutBatchHandler);

  /* ── Admin: batch claim payouts (manual trigger — pending → processing, with limit) ── */
  app.post('/payments/payouts/batch-claim', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const limit = Math.min(Number(request.body?.limit) || 100, 200);
    const pending = await db.PayoutRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(limit).select('_id').lean();
    const ids = pending.map((p) => p._id);
    if (ids.length === 0) return reply.send({ ok: true, processed: 0 });
    const result = await db.PayoutRequest.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'processing' } }
    );
    const processed = result.modifiedCount ?? 0;
    await writeAdminAuditLog({
      adminId: admin._id,
      action:  'payout_batch_claim',
      meta:    { processed, limit, payoutIds: ids.map((id) => String(id)) },
    });
    return reply.send({ ok: true, processed });
  });

  /* ── Admin: batch approve payouts (Phase 9, orchestration: KYC re-check per payout) ── */
  app.post('/payments/payouts/batch-approve', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { payoutIds, note } = request.body ?? {};
    if (!Array.isArray(payoutIds) || payoutIds.length === 0) {
      return reply.status(400).send({ error: 'PAYOUT_IDS_REQUIRED', message: 'payoutIds must be a non-empty array' });
    }
    if (payoutIds.length > 50) return reply.status(400).send({ error: 'TOO_MANY', message: 'Max 50 payouts per batch' });
    const validIds = payoutIds.filter((id) => id && /^[a-f0-9]{24}$/i.test(String(id)));
    if (validIds.length === 0) return reply.status(400).send({ error: 'INVALID_IDS' });
    const result = await paymentOrchestration.executePayoutBatchWithChecks(validIds, admin._id, note);
    return reply.send({ ok: true, ...result });
  });

  /* ── Admin: run automated payout cycle (PAYOUT_AUTO_ENABLED + SYSTEM_ADMIN_ID) ── */
  app.post('/payments/payouts/run-automated-cycle', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const result = await paymentOrchestration.runAutomatedPayoutCycle();
    return reply.send({ ok: true, ...result });
  });

  /* ── Admin: list eligible creators for automated payout ── */
  app.get('/payments/payouts/eligible-automated', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const eligible = await paymentOrchestration.getEligibleForAutomatedPayout();
    return reply.send({ eligible, thresholdCents: paymentOrchestration.PAYOUT_AUTO_THRESHOLD_CENTS });
  });

  /* ── Payment search by query (alias for reference lookup) — same auth as /payments/reference/:ref ── */
  app.get('/payments/search', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const reference = request.query?.reference != null ? String(request.query.reference).trim() : '';
    if (!reference) {
      return reply.status(400).send({ error: 'REFERENCE_REQUIRED', message: 'Query parameter reference is required.' });
    }
    if (reference.length > 256) {
      return reply.status(400).send({ error: 'REFERENCE_INVALID', message: 'Reference too long.' });
    }
    const hit = await ledgerService.findUniversalPaymentById(reference);
    if (!hit) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'No payment found for this reference.' });
    }
    const ownerId = ledgerService.ownerUserIdFromHit(hit);
    const staffPayment = user.role === 'admin' || user.role === 'support';
    if (!staffPayment && ownerId && String(ownerId) !== String(user._id)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own payments.' });
    }
    const u = ledgerService.toUniversalPayment(hit);
    const cents = u.amountCents != null ? Number(u.amountCents) : null;
    const amount =
      cents != null && Number.isFinite(cents)
        ? cents / 100
        : hit.kind === 'payment_reference' && hit.doc.amount != null && Number.isFinite(Number(hit.doc.amount))
          ? Number(hit.doc.amount)
          : 0;
    const payload = {
      ok: true,
      source: u.source,
      payment: {
        id: u.id,
        provider: u.provider,
        reference: u.reference || u.providerId,
        status: u.status,
        amount,
        currency: u.currency || 'USD',
        userId: u.userId,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    };
    if (staffPayment) {
      const { getPaymentsState } = require('../lib/providerState');
      payload.operatorContext = { paymentProviders: getPaymentsState() };
    }
    return reply.send(payload);
  });

  /* ── Payment lookup by reference — same resolver as /payments/search (MoneyIndex-first + legacy + backfill) ── */
  app.get('/payments/reference/:ref', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const rawRef = request.params.ref;
    if (!rawRef) return reply.status(400).send({ error: 'REFERENCE_REQUIRED' });
    const ref = String(rawRef).trim();
    if (ref.length > 256) return reply.status(400).send({ error: 'REFERENCE_INVALID' });
    const hit = await ledgerService.findUniversalPaymentById(ref);
    if (!hit) return reply.status(404).send({ error: 'PAYMENT_NOT_FOUND', message: 'No payment found for this reference.' });
    const ownerId = ledgerService.ownerUserIdFromHit(hit);
    const staffRef = user.role === 'admin' || user.role === 'support';
    if (!staffRef && ownerId && String(ownerId) !== String(user._id)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own payments.' });
    }
    const u = ledgerService.toUniversalPayment(hit);
    const cents = u.amountCents != null ? Number(u.amountCents) : null;
    const amount =
      cents != null && Number.isFinite(cents)
        ? cents / 100
        : hit.kind === 'payment_reference' && hit.doc.amount != null && Number.isFinite(Number(hit.doc.amount))
          ? Number(hit.doc.amount)
          : 0;
    const metadata =
      hit.kind === 'payment_reference' && hit.doc.metadata
        ? hit.doc.metadata
        : hit.kind === 'money_index' && hit.doc.meta && typeof hit.doc.meta === 'object'
          ? hit.doc.meta
          : {};
    const refPayload = {
      _id: u.id,
      userId: u.userId || null,
      provider: u.provider,
      referenceId: u.providerId,
      status: u.status,
      amount,
      amountCents: cents,
      currency: u.currency || 'USD',
      metadata,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      lookupSource: u.source,
      moneyRefId: u.refId || null,
    };
    if (staffRef) {
      const { getPaymentsState } = require('../lib/providerState');
      refPayload.operatorContext = { paymentProviders: getPaymentsState() };
    }
    return reply.send(refPayload);
  });

  /**
   * Universal payment lookup — stable shape for clients and support tools.
   * Same auth as /payments/reference/:ref. Id = PaymentReference _id or provider referenceId (e.g. pi_*, cs_*).
   * (Gateway may expose as GET /api/payments/universal/:id)
   */
  app.get('/payments/universal/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const rawId = request.params.id != null ? String(request.params.id).trim() : '';
    if (!rawId || rawId.length > 256) {
      return reply.status(400).send({ error: 'ID_REQUIRED', message: 'Valid payment id or reference required.' });
    }
    const hit = await ledgerService.findUniversalPaymentById(rawId);
    if (!hit) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No payment found for this id.' });
    const ownerId = ledgerService.ownerUserIdFromHit(hit);
    const staffPayment = user.role === 'admin' || user.role === 'support';
    if (!staffPayment && ownerId && String(ownerId) !== String(user._id)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own payments.' });
    }
    const body = ledgerService.toUniversalPayment(hit);
    if (staffPayment) {
      const { getPaymentsState } = require('../lib/providerState');
      body.operatorContext = { paymentProviders: getPaymentsState() };
    }
    return reply.send(body);
  });

  /**
   * MoneyIndex-only lookup — single collection (refId, providerId, or source ObjectId).
   * GET /api/money/:id and GET /money/:id — same auth as /payments/universal.
   */
  const handleMoneyIndexGet = async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const rawId = request.params.id != null ? String(request.params.id).trim() : '';
    if (!rawId || rawId.length > 256) {
      return reply.status(400).send({
        error: 'ID_REQUIRED',
        message: 'Valid money refId, providerId, or source ObjectId required.',
      });
    }
    const row = await ledgerService.findMoneyIndexByAnyId(rawId);
    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No money index row for this id.' });
    const hit = { kind: 'money_index', doc: row };
    const ownerId = ledgerService.ownerUserIdFromHit(hit);
    const staffMoney = user.role === 'admin' || user.role === 'support';
    if (!staffMoney && ownerId && String(ownerId) !== String(user._id)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You can only view your own money records.' });
    }
    const body = ledgerService.toUniversalPayment(hit);
    if (staffMoney) {
      const { getPaymentsState } = require('../lib/providerState');
      body.operatorContext = { paymentProviders: getPaymentsState() };
    }
    return reply.send(body);
  };
  app.get('/money/:id', handleMoneyIndexGet);
  app.get('/api/money/:id', handleMoneyIndexGet);

  /* ── Reconciliation API — summary for date range (admin or support) ── */
  app.get('/payments/reconciliation', async (request, reply) => {
    const user = await authUser(request);
    if (!user || (user.role !== 'admin' && user.role !== 'support')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const from = request.query?.from ? new Date(request.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = request.query?.to ? new Date(request.query.to) : new Date();
    const [revenueAgg, payoutAgg, refundAgg, chargebackAgg] = await Promise.all([
      db.PaymentReference.aggregate([
        { $match: { status: 'completed', provider: { $in: ['stripe', 'paypal', 'coin'] }, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      db.PayoutRequest.aggregate([
        { $match: { status: 'paid', $or: [{ paidAt: { $gte: from, $lte: to } }, { paidAt: { $exists: false }, updatedAt: { $gte: from, $lte: to } }] } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      db.PaymentReference.aggregate([
        { $match: { status: 'refunded', createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      db.Chargeback.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$amountCents', 0] } }, lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, { $ifNull: ['$amountCents', 0] }, 0] } } } },
      ]),
    ]);
    const revenue = revenueAgg[0]?.total ?? 0;
    const payouts = payoutAgg[0]?.total ?? 0;
    const refunds = refundAgg[0]?.total ?? 0;
    const chargebacks = chargebackAgg[0]?.total ?? 0;
    const chargebacksLost = chargebackAgg[0]?.lost ?? 0;
    return reply.send({
      from,
      to,
      revenueCents: revenue,
      payoutsCents: payouts,
      refundsCents: refunds,
      chargebacksCents: chargebacks,
      chargebacksLostCents: chargebacksLost,
      netCents: revenue - payouts - refunds - chargebacksLost,
    });
  });

  /* ── Admin: generic payment search — user, creator, status, date range, or ?reference= universal id ── */
  app.get('/payments/lookup', async (request, reply) => {
    const user = await authUser(request);
    const staffOk = user && (user.role === 'admin' || user.role === 'support' || user.role === 'ops');
    if (!staffOk) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { user_id, creator_id, userId, creatorId, status, from, to, reference, ref } = request.query ?? {};
    const refQ = reference != null && String(reference).trim() ? String(reference).trim() : (ref != null && String(ref).trim() ? String(ref).trim() : '');
    if (refQ) {
      if (refQ.length > 256) return reply.status(400).send({ error: 'REFERENCE_INVALID' });
      const hit = await ledgerService.findUniversalPaymentById(refQ);
      if (!hit) return reply.status(404).send({ error: 'NOT_FOUND' });
      const body = ledgerService.toUniversalPayment(hit);
      const { getPaymentsState } = require('../lib/providerState');
      body.operatorContext = { paymentProviders: getPaymentsState() };
      return reply.send({ ok: true, universal: body, hitKind: hit.kind });
    }
    const uid = user_id || userId;
    const cid = creator_id || creatorId;
    const query = {};
    if (uid) {
      if (!validateId(uid, reply)) return;
      query.userId = uid;
    }
    if (cid) {
      if (!validateId(cid, reply)) return;
      query.creatorId = cid;
    }
    if (status) query.status = status;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    const payments = await db.PaymentTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return reply.send(payments);
  });

  /* ── Admin: list pending payouts ── */
  app.get('/payments/payouts/admin', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { status = 'pending', limit = 50, page = 1 } = request.query ?? {};
    const query = status === 'all' ? {} : { status };
    const payouts = await db.PayoutRequest.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    return reply.send({ payouts, total: await db.PayoutRequest.countDocuments(query) });
  });

  /* ── Admin: approve or reject a payout (orchestration: KYC re-check on approve) ── */
  app.post('/payments/payouts/:id/action', { preHandler: [requireCapability('payouts')] }, async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });

    const { action, note } = request.body ?? {}; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return reply.status(400).send({ error: 'INVALID_ACTION', valid: ['approve', 'reject'] });
    }

    let payout = await db.PayoutRequest.findById(request.params.id);
    if (!payout) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (payout.status !== 'pending') {
      return reply.status(400).send({ error: 'NOT_PENDING', status: payout.status });
    }

    const { notifyUser } = require('../lib/notifyUser');
    const recipient = await db.User.findById(payout.userId).lean().catch(() => null);
    const amtStr = '$' + (payout.amountCents / 100).toFixed(2);

    if (action === 'approve') {
      const approveResult = await paymentOrchestration.executePayoutWithChecks(payout._id, admin._id, note);
      if (!approveResult.ok) {
        const status = approveResult.error === 'KYC_REVOKED' ? 403 : 500;
        return reply.status(status).send({ error: approveResult.error, message: approveResult.message });
      }
      try {
        payout = await db.PayoutRequest.findById(payout._id);
        await notifyUser(payout.userId, { type: 'payoutApproved', title: 'Payout approved!', body: `Your payout of ${amtStr} has been approved and is being processed.`, meta: { payoutId: String(payout._id), amountCents: payout.amountCents } })
          .catch((err) => request.log.warn({ err, payoutId: String(payout._id) }, 'Failed to send payout-approved notification'));
        if (recipient?.email) {
          sendCustomerEmail({
            template: 'payout_approved',
            to:      recipient.email,
            subject: `Your payout of ${amtStr} has been approved`,
            title:   'Payout approved',
            body:    `Great news! Your payout request for ${amtStr} has been approved. Funds will arrive within 1-5 business days depending on your payment provider.`,
            ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/dashboard',
            ctaText: 'View dashboard',
          }).catch((err) => request.log.warn({ err, email: recipient.email }, 'Failed to send payout-approved email'));
        }
      } catch (notifyErr) {
        request.log.warn({ err: notifyErr, payoutId: String(payout._id) }, 'Payout approved but notification failed');
      }
      await writeAuditLog({
        action: 'PAYOUT_APPROVED',
        actorId: admin._id,
        resourceType: 'payout',
        resourceId: String(payout._id),
        meta: { userId: String(payout.userId), amountCents: payout.amountCents },
      }).catch(() => {});
    } else {
      await rejectPayout(payout._id, admin._id, note);
      await notifyUser(payout.userId, { type: 'payoutRejected', title: 'Payout not processed', body: `Your payout request for ${amtStr} was not approved. ${note ? `Reason: ${note}` : 'Please contact support for details.'} Funds returned to wallet.`, meta: { payoutId: String(payout._id) } })
        .catch((err) => request.log.warn({ err, payoutId: String(payout._id) }, 'Failed to send payout-rejected notification'));
      if (recipient?.email) {
        sendCustomerEmail({
          template: 'payout_rejected',
          to:      recipient.email,
          subject: `Update on your payout request for ${amtStr}`,
          title:   'Payout request update',
          body:    `We were unable to process your payout of ${amtStr}. ${note || 'Please contact our support team for more information.'} The funds have been returned to your Millo wallet.`,
          ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/support',
          ctaText: 'Contact support',
        }).catch((err) => request.log.warn({ err, email: recipient.email }, 'Failed to send payout-rejected email'));
      }
      await writeAuditLog({
        action: 'PAYOUT_REJECTED',
        actorId: admin._id,
        resourceType: 'payout',
        resourceId: String(payout._id),
        meta: { userId: String(payout.userId), amountCents: payout.amountCents, note: note || null },
      }).catch(() => {});
      payout = await db.PayoutRequest.findById(payout._id);
    }

    return reply.send({ ok: true, payout: payout.toObject() });
  });

  /* ── Buy Now — single-product checkout (convenience endpoint) ── */
  app.post('/payments/shop/buy-now', { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { productId, qty = 1, deviceFingerprint } = request.body ?? {};
    if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED' });
    if (!validateId(productId, reply)) return;

    const product = await db.Product.findById(productId).lean();
    if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', productId: String(productId) });
    if (product.status !== 'active') return reply.status(400).send({ error: 'PRODUCT_NOT_AVAILABLE', productId: String(productId) });
    const quantity = Math.max(1, Math.round(Number(qty) || 1));
    if (product.inventory >= 0 && product.inventory < quantity) {
      return reply.status(400).send({ error: 'INSUFFICIENT_INVENTORY', productId: String(productId), available: product.inventory });
    }

    try {
      await commerceIntegrity.assertSellerVerified(product.creatorId);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    const orderItems = [{
      productId,
      creatorId: product.creatorId,
      name: product.name,
      qty: quantity,
      priceCents: product.priceCents,
      imageUrl: product.imageUrls?.[0],
    }];
    const totalCents = orderItems[0].priceCents * quantity;

    const region = request.region || {};
    const country = region.user_country || 'US';
    if (paymentRouter.isCoinOnlyRegion && paymentRouter.isCoinOnlyRegion(country)) {
      return reply.status(403).send({
        error:   'COIN_ONLY_REQUIRED',
        message: 'Direct card payments are not available in your region. Please purchase coins first and use your wallet balance.',
      });
    }
    const geoOpts = await buildGeoOpts(request, user._id, country);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts, { currencyCode: 'USD' });
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, totalCents, { ...fraudOpts, refType: 'buy_now', refId: String(productId) });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }
    const metadataItems = JSON.stringify(orderItems.map((i) => ({ p: String(i.productId), q: i.qty, c: i.priceCents, r: String(i.creatorId) })));
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const lineItems = orderItems.map((item) => ({
      price_data: {
        currency:     'usd',
        unit_amount:  Math.round(Number(item.priceCents) || 0),
        product_data: {
          name:   String(item.name).slice(0, 200),
          images: (item.imageUrl ? [item.imageUrl] : []),
        },
      },
      quantity: item.qty,
    }));

    const stripeClient = getStripe();
    if (!stripeClient) {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(503).send({ error: 'PAYMENTS_UNAVAILABLE', message: 'Payment processing is unavailable. Please contact support.' });
      }
      // DEV ONLY: Create pending order - will be confirmed via webhook simulation
      const customsMode = product.customsMode || 'DAP';
      const order = await createOrderFromItems(user._id, orderItems, totalCents, null, {}, customsMode);
      order.status = 'pending_payment';
      order.meta = order.meta || {};
      order.meta.devStub = true;
      await order.save();
      await paymentReferenceService
        .upsertPaymentReference({
          provider: 'internal',
          referenceId: `order:${String(order._id)}`,
          userId: user._id,
          status: 'pending',
          amountCents: totalCents,
          currency: 'USD',
          metadata: { kind: 'shop_buy_now_stub', orderId: String(order._id) },
        })
        .catch(() => {});
      request.log.warn({ userId: String(user._id), orderId: order._id, totalCents }, '[DEV STUB] Buy Now order created with pending_payment status');
      return reply.send({
        ok: true,
        stub: true,
        orderId: String(order._id),
        totalCents,
        message: 'DEV: Order created with pending_payment status. Use webhook to complete.',
      });
    }
    try {
      const radarMeta = fraudService.getStripeRadarMetadata(user._id, fraudOpts);
      const sessionParams = {
        payment_method_types: ['card'],
        mode:                 'payment',
        line_items:           lineItems,
        customer_email:       user.email,
        metadata:             {
          userId: String(user._id),
          shipping: JSON.stringify({}),
          items: metadataItems.length <= 500 ? metadataItems : metadataItems.slice(0, 497) + ']',
          ...radarMeta,
        },
        success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${frontendUrl}/creator/${product.creatorId}/shop/${productId}`,
        shipping_address_collection: { allowed_countries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR'] },
      };
      if (totalCents >= 5000) {
        sessionParams.payment_method_options = { card: { request_three_d_secure: 'any' } };
      }
      const session = await stripeClient.checkout.sessions.create(sessionParams);
      await paymentReferenceService
        .upsertPaymentReference({
          provider: 'stripe',
          referenceId: session.id,
          userId: user._id,
          status: 'pending',
          amountCents: totalCents,
          currency: 'USD',
          metadata: { kind: 'shop_buy_now' },
        })
        .catch(() => {});
      return reply.send({ ok: true, redirectUrl: session.url, sessionId: session.id });
    } catch (stripeErr) {
      return reply.status(500).send({ error: 'STRIPE_ERROR', message: stripeErr.message });
    }
  });

  /* ── Phase 3: Checkout preview (breakdown: product, VAT, platform fee, total) ── */
  app.post('/payments/shop/checkout-preview', { config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { items, shipping } = request.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'ITEMS_REQUIRED' });
    }

    const orderItems = [];
    for (const item of items) {
      const productId = item.productId;
      if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED' });
      if (!validateId(productId, reply)) return;
      const product = await db.Product.findById(productId).lean();
      if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', productId: String(productId) });
      if (product.status !== 'active') return reply.status(400).send({ error: 'PRODUCT_NOT_AVAILABLE' });
      const qty = Math.max(1, Math.round(Number(item.qty) || 1));
      orderItems.push({ productId, priceCents: product.priceCents, qty, name: product.name });
    }

    const region = request.region || {};
    const country = shipping?.country || region.user_country || 'US';
    const breakdown = await checkoutBreakdown.computeCheckoutBreakdown(orderItems, {
      ...region,
      user_country: country,
    });
    const paymentMethods = paymentRouter.getPaymentMethodsForRegion(region.user_compliance_zone, country);
    const primaryMethod = paymentRouter.getPrimaryMethodLabel(region.user_compliance_zone, country);

    return reply.send({
      ok: true,
      breakdown,
      paymentMethods,
      primaryMethod,
      formatted: {
        productPrice: checkoutBreakdown.formatAmount(breakdown.subtotalCents, breakdown.currency),
        vat: breakdown.taxCents > 0 ? checkoutBreakdown.formatAmount(breakdown.taxCents, breakdown.currency) : null,
        platformFee: checkoutBreakdown.formatAmount(breakdown.platformFeeCents, breakdown.currency),
        total: checkoutBreakdown.formatAmount(breakdown.totalCents, breakdown.currency),
      },
    });
  });

  /* ── Cart / shop checkout via Stripe ── */
  app.post('/payments/shop/checkout', { preHandler: [requireCapability('payments'), requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { items, shipping, deviceFingerprint, couponCode, creatorId: couponCreatorId } = request.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'ITEMS_REQUIRED' });
    }

    // Validate items: require productId, resolve products for creatorId/name/price
    const orderItems = [];
    let orderCustomsMode = 'DAP';
    for (const item of items) {
      const productId = item.productId;
      if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED', message: 'Each item must include productId' });
      if (!validateId(productId, reply)) return;
      const product = await db.Product.findById(productId).lean();
      if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', productId: String(productId) });
      if (product.status !== 'active') return reply.status(400).send({ error: 'PRODUCT_NOT_AVAILABLE', productId: String(productId) });
      const qty = Math.max(1, Math.round(Number(item.qty) || 1));
      if (product.inventory >= 0 && product.inventory < qty) {
        return reply.status(400).send({ error: 'INSUFFICIENT_INVENTORY', productId: String(productId), available: product.inventory });
      }
      if (orderItems.length === 0) orderCustomsMode = product.customsMode || 'DAP';
      orderItems.push({
        productId,
        creatorId: product.creatorId,
        name: product.name,
        qty,
        priceCents: product.priceCents,
        imageUrl: product.imageUrls?.[0],
      });
    }

    const uniqueSellerIds = [...new Set(orderItems.map((i) => i.creatorId))];
    try {
      for (const sellerId of uniqueSellerIds) {
        await commerceIntegrity.assertSellerVerified(sellerId);
      }
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    let totalCents = orderItems.reduce((s, i) => s + i.priceCents * i.qty, 0);
    let discountCents = 0;
    let couponId = null;

    // Optional creator coupon: validate and apply discount (cart must be single-creator for that creator).
    if (couponCode?.trim() && couponCreatorId) {
      if (!validateId(couponCreatorId, reply)) return;
      const creatorIds = [...new Set(orderItems.map((i) => String(i.creatorId)))];
      if (creatorIds.length > 1) {
        return reply.status(400).send({ error: 'COUPON_SINGLE_CREATOR', message: 'Coupon can only be applied when all items are from the same creator.' });
      }
      if (creatorIds[0] !== String(couponCreatorId)) {
        return reply.status(400).send({ error: 'COUPON_CREATOR_MISMATCH', message: 'Coupon does not apply to this creator.' });
      }
      const code = String(couponCode).trim().toUpperCase();
      const coupon = await db.CreatorCoupon.findOne({
        creatorId: couponCreatorId,
        code,
        active: true,
      }).lean();
      if (!coupon) {
        return reply.status(400).send({ error: 'COUPON_INVALID', message: 'Invalid or inactive code.' });
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) {
        return reply.status(400).send({ error: 'COUPON_EXPIRED', message: 'Code has expired.' });
      }
      if (coupon.maxRedemptions != null && (coupon.redemptionCount || 0) >= coupon.maxRedemptions) {
        return reply.status(400).send({ error: 'COUPON_MAX_REDEEMED', message: 'Code has reached maximum redemptions.' });
      }
      if (coupon.discountType === 'percent') {
        discountCents = Math.round(totalCents * (Number(coupon.amount) || 0) / 100);
      } else {
        discountCents = Math.min(Number(coupon.amount) || 0, totalCents);
      }
      totalCents = Math.max(0, totalCents - discountCents);
      couponId = String(coupon._id);
    }

    const cardCountry = shipping?.country || request.region?.user_country;
    const geoOpts = await buildGeoOpts(request, user._id, cardCountry);
    const fraudOpts = buildFraudRequestOpts(request, user, deviceFingerprint, geoOpts, { currencyCode: 'USD' });
    if (!(await enforceFraudPolicyGate(user, reply))) return;
    if (!(await enforceDeviceRiskGate(user, deviceFingerprint, reply))) return;
    const fraudResult = await fraudService.evaluateAndLogPayment(user._id, totalCents, { ...fraudOpts, refType: 'shop_checkout', refId: null });
    if (fraudResult.action === 'block') {
      return reply.status(403).send({ error: 'FRAUD_BLOCKED', message: 'This transaction could not be completed. Please contact support.' });
    }

    const metadataItems = JSON.stringify(orderItems.map((i) => ({ p: String(i.productId), q: i.qty, c: i.priceCents, r: String(i.creatorId) })));
    const radarMeta = fraudService.getStripeRadarMetadata(user._id, fraudOpts);

    const region = request.region || {};
    const country = shipping?.country || region.user_country || 'US';
    if (paymentRouter.isCoinOnlyRegion && paymentRouter.isCoinOnlyRegion(country)) {
      return reply.status(403).send({
        error:   'COIN_ONLY_REQUIRED',
        message: 'Direct card payments are not available in your region. Please purchase coins first and use your wallet balance.',
      });
    }
    const paymentMethodTypes = paymentRouter.getPaymentMethodsForRegion(region.user_compliance_zone, country);
    const stripeCurrency = paymentRouter.getCheckoutCurrency(region.user_compliance_zone, country);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const lineItems = await Promise.all(orderItems.map(async (item) => {
      let unitAmount = Math.round(Number(item.priceCents) || 0);
      if (stripeCurrency !== 'usd') {
        try {
          const localTotal = await currencyService.convertUSDToLocal(item.priceCents * item.qty, stripeCurrency.toUpperCase());
          unitAmount = Math.max(50, Math.round(localTotal / item.qty));
        } catch (_) { /* keep USD */ }
      }
      return {
        price_data: {
          currency:     stripeCurrency,
          unit_amount:  unitAmount,
          product_data: {
            name:   String(item.name).slice(0, 200),
            images: (item.imageUrl ? [item.imageUrl] : []),
          },
        },
        quantity: item.qty,
      };
    }));

    // Discount line (creator coupon) — negative amount in session currency
    if (discountCents > 0 && couponId) {
      let discountUnitAmount = -Math.round(discountCents);
      if (stripeCurrency !== 'usd') {
        try {
          const localDiscount = await currencyService.convertUSDToLocal(discountCents, stripeCurrency.toUpperCase());
          discountUnitAmount = -Math.round(localDiscount);
        } catch (_) { /* keep USD */ }
      }
      const couponDoc = await db.CreatorCoupon.findById(couponId).select('code').lean().catch(() => null);
      const codeLabel = couponDoc?.code || 'COUPON';
      lineItems.push({
        price_data: {
          currency:     stripeCurrency,
          unit_amount:  discountUnitAmount,
          product_data: { name: `Discount (${codeLabel})` },
        },
        quantity: 1,
      });
    }

    // Try real Stripe checkout session
    const stripeClient = getStripe();
    if (!stripeClient) {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(503).send({ error: 'PAYMENTS_UNAVAILABLE', message: 'Payment processing is unavailable. Please contact support.' });
      }
      // DEV ONLY: Create pending order - will be confirmed via webhook simulation
      const orderMeta = couponId ? { couponId } : {};
      const order = await createOrderFromItems(user._id, orderItems, totalCents, null, shipping || {}, orderCustomsMode, orderMeta);
      order.status = 'pending_payment';
      order.meta = order.meta || {};
      order.meta.devStub = true;
      await order.save();
      await paymentReferenceService
        .upsertPaymentReference({
          provider: 'internal',
          referenceId: `order:${String(order._id)}`,
          userId: user._id,
          status: 'pending',
          amountCents: totalCents,
          currency: 'USD',
          metadata: { kind: 'shop_checkout_stub', orderId: String(order._id) },
        })
        .catch(() => {});
      request.log.warn({ userId: String(user._id), orderId: order._id, totalCents }, '[DEV STUB] Shop checkout order created with pending_payment status');
      return reply.send({
        ok: true,
        stub: true,
        orderId: String(order._id),
        totalCents,
        message: 'DEV: Order created with pending_payment status. Use webhook to complete.',
      });
    }
    try {
      const sessionParams = {
        payment_method_types: paymentMethodTypes,
        mode:                 'payment',
        line_items:           lineItems,
        customer_email:       user.email,
        metadata:             {
          userId: String(user._id),
          shipping: JSON.stringify(shipping || {}),
          items: metadataItems.length <= 500 ? metadataItems : metadataItems.slice(0, 497) + ']',
          ...(couponId ? { couponId, discountCents: String(discountCents) } : {}),
          ...radarMeta,
        },
        success_url:          `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:           `${frontendUrl}/checkout`,
        shipping_address_collection: shipping ? undefined : { allowed_countries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'BR', 'IN', 'MX', 'NL'] },
      };
      if (totalCents >= 5000) {
        sessionParams.payment_method_options = { card: { request_three_d_secure: 'any' } };
      }
      const session = await stripeClient.checkout.sessions.create(sessionParams);

      await paymentReferenceService
        .upsertPaymentReference({
          provider: 'stripe',
          referenceId: session.id,
          userId: user._id,
          status: 'pending',
          amountCents: totalCents,
          currency: String(stripeCurrency || 'usd').toUpperCase(),
          metadata: { kind: 'shop_checkout' },
        })
        .catch(() => {});

      const breakdown = await checkoutBreakdown.computeCheckoutBreakdown(orderItems, { ...region, user_country: country });
      return reply.send({
        ok: true,
        redirectUrl: session.url,
        sessionId: session.id,
        breakdown: {
          ...breakdown,
          formatted: {
            productPrice: checkoutBreakdown.formatAmount(breakdown.subtotalCents, breakdown.currency),
            vat: breakdown.taxCents > 0 ? checkoutBreakdown.formatAmount(breakdown.taxCents, breakdown.currency) : null,
            platformFee: checkoutBreakdown.formatAmount(breakdown.platformFeeCents, breakdown.currency),
            total: checkoutBreakdown.formatAmount(breakdown.totalCents, breakdown.currency),
          },
        },
      });
    } catch (stripeErr) {
      return reply.status(500).send({ error: 'STRIPE_ERROR', message: stripeErr.message });
    }
  });

  /* ── Stripe webhook (handler first, routes registered below) ── */
  async function stripeWebhookHandler(request, reply) {
    const sig     = request.headers['stripe-signature'];
    const payload = request.rawBody || JSON.stringify(request.body);
    const { ok, event, error } = stripe.verifyWebhook(payload, sig);
    if (!ok) {
      logWebhookVerifyFailedAudit('stripe', request, error);
      return reply.status(400).send({ error });
    }

    const stripeEventId = event?.id ? String(event.id) : '';
    const stripeDedupeTtl = Number(process.env.STRIPE_WEBHOOK_DEDUPE_TTL_SEC) || 172800;
    if (stripeEventId) {
      const { first } = await markWebhookFirstSeen('stripe', stripeEventId, stripeDedupeTtl);
      if (!first) {
        request.log.info({ eventId: stripeEventId }, 'Stripe webhook duplicate delivery (ignored)');
        return reply.send({ received: true, duplicate: true });
      }
    }
    writeAuditLog({
      action: 'WEBHOOK_STRIPE_EVENT',
      resourceType: 'stripe_event',
      resourceId: stripeEventId || 'unknown',
      meta: { type: event.type },
    }).catch((err) => request.log.warn({ err }, 'Stripe webhook ingest audit skipped'));

    try {
      if (event.type === 'payment_intent.succeeded') {
        const pi     = event.data.object;
        const userId = pi.metadata?.userId;
        const packId = pi.metadata?.packId;
        await paymentReferenceService.upsertPaymentReference({
          provider: 'stripe',
          referenceId: pi.id,
          userId: userId || null,
          status: 'completed',
          amountCents: pi.amount_received ?? 0,
          currency: (pi.currency || 'usd').toUpperCase(),
          metadata: { packId, paymentIntentId: pi.id },
        }).catch(() => {});
        if (userId && packId && isMongoObjectIdString(String(userId))) {
          const totalCoins = pricing.packTotalCoins(packId);
          if (totalCoins <= 0) {
            request.log.warn({ packId, piId: pi.id }, 'Webhook payment_intent.succeeded: unknown pack or zero coins');
          } else {
            const lockTtlMs = Math.min(Number(process.env.WALLET_CREDIT_LOCK_MS) || 15_000, 60_000);
            try {
              await financialIntegrity.executeMoneyOperation({
                userId,
                idempotencyKey: `coin_confirm_pi_${pi.id}`,
                requireProviderLive: 'stripe',
                lockTtlMs,
                fn: async () => {
                  const dupLedger = await db.LedgerEntry.findOne({ refType: 'coin_purchase', refId: String(pi.id) }).lean();
                  if (dupLedger) {
                    return { ok: true, coinsAdded: 0, packId, duplicate: true };
                  }
                  const economy = require('@millo/economy');
                  await economy.credit(
                    userId,
                    totalCoins * 100,
                    'coin_purchase',
                    pi.id,
                    { packId, totalCoins }
                  );
                  await paymentReferenceService.upsertPaymentReference({
                    provider: 'stripe',
                    referenceId: pi.id,
                    userId,
                    status: 'completed',
                    amountCents: pi.amount_received ?? 0,
                    currency: (pi.currency || 'usd').toUpperCase(),
                    metadata: { packId, totalCoins, source: 'webhook_payment_intent_succeeded' },
                  }).catch(() => {});
                  kafka.publish(kafka.TOPICS.PAYMENTS, {
                    event: 'coins.purchased',
                    userId: String(userId),
                    packId: String(packId),
                    coinsAdded: totalCoins,
                    paymentIntentId: pi.id,
                  }).catch(() => {});
                  await writeAuditLog({
                    action: 'COIN_PURCHASE_CONFIRMED',
                    actorId: userId,
                    resourceType: 'payment_intent',
                    resourceId: String(pi.id),
                    meta: { packId, coinsAdded: totalCoins, source: 'webhook_payment_intent_succeeded' },
                  }).catch(() => {});
                  await notifyUser(userId, {
                    type: 'coinPurchase',
                    title: 'Coins added',
                    body: `You received ${Number(totalCoins) || 0} coins.`,
                    meta: { packId, totalCoins, paymentIntentId: pi.id },
                  }).catch((err) => request.log.error({ err }, 'Webhook: failed to create coinPurchase notification'));
                  return { ok: true, coinsAdded: totalCoins, packId };
                },
              });
            } catch (webhookPiErr) {
              if (webhookPiErr.name === 'FinancialIntegrityError' ||
                  webhookPiErr.code === 'PAYMENTS_NOT_LIVE' ||
                  webhookPiErr.code === 'PAYMENT_PROVIDER_NOT_LIVE') {
                request.log.warn({ err: webhookPiErr, piId: pi.id }, 'payment_intent.succeeded coin: financial integrity blocked');
                return reply.status(200).send({ received: true, skipped: 'financial_integrity' });
              }
              if (webhookPiErr.code === 'IDEMPOTENT_REPLAY') {
                request.log.warn({ err: webhookPiErr, piId: pi.id }, 'payment_intent.succeeded coin: idempotent failed replay');
                return reply.status(200).send({ received: true });
              }
              if (webhookPiErr instanceof LockContentionError) {
                request.log.warn({ err: webhookPiErr, piId: pi.id }, 'payment_intent.succeeded coin: lock contention');
                return reply.status(500).send({ error: 'LOCK_CONTENTION' });
              }
              throw webhookPiErr;
            }
          }
        }
      } else if (event.type === 'checkout.session.completed') {
        const session  = event.data.object;
        const userId   = session.metadata?.userId;
        const metaType = session.metadata?.type;
        // Creator upgrade (hybrid: $4.99/mo or $69 lifetime)
        if (metaType === 'creator_monthly' || metaType === 'creator_lifetime') {
          const creatorUpgrade = require('../services/creatorUpgradeService');
          await creatorUpgrade.handleCheckoutCompleted(session).catch((err) => request.log.error({ err }, 'Webhook: creator upgrade handleCheckoutCompleted failed'));
          return reply.status(200).send({ received: true });
        }
        if (userId && session.mode === 'subscription') {
          // Subscription activation is critical — let errors surface to outer catch
          await db.Subscription.findOneAndUpdate(
            { userId },
            { $set: { status: 'active', externalId: session.subscription, updatedAt: new Date() } },
            { upsert: true }
          );
          const { notifyUser } = require('../lib/notifyUser');
          await notifyUser(userId, {
            type:  'subscriptionActivated',
            title: 'Subscription activated!',
            body:  'Your Millo subscription is now active. Welcome aboard!',
            meta:  { sessionId: session.id },
          }).catch((err) => request.log.error({ err }, 'Webhook: failed to notify subscriptionActivated'));
        } else if (userId && session.mode === 'payment') {
          await paymentReferenceService.upsertPaymentReference({
            provider: 'stripe',
            referenceId: session.id,
            userId: userId || null,
            status: 'completed',
            amountCents: session.amount_total ?? 0,
            currency: (session.currency || 'usd').toUpperCase(),
            metadata: { sessionId: session.id, packId: session.metadata?.packId },
          }).catch(() => {});
          // Coin pack checkout — same integrity path as payment_intent.succeeded / coins/confirm;
          // idempotency: prefer PI key so checkout + PI webhooks cannot double-credit.
          const packId = session.metadata?.packId;
          const metaCoinsRaw = session.metadata?.totalCoins;
          if (
            packId &&
            isMongoObjectIdString(String(userId)) &&
            (metaCoinsRaw != null || pricing.packTotalCoins(packId) > 0)
          ) {
            let totalCoins = pricing.packTotalCoins(packId);
            if (totalCoins <= 0 && metaCoinsRaw != null) {
              totalCoins = Number(metaCoinsRaw) || 0;
            }
            if (totalCoins > 0) {
              const piRaw = session.payment_intent;
              const piId =
                typeof piRaw === 'string'
                  ? piRaw
                  : (piRaw && typeof piRaw === 'object' && piRaw.id)
                    ? String(piRaw.id)
                    : '';
              const idempotencyKey = piId
                ? `coin_confirm_pi_${piId}`
                : `coin_checkout_cs_${session.id}`;
              const ledgerRefId = piId || String(session.id);
              const lockTtlMs = Math.min(Number(process.env.WALLET_CREDIT_LOCK_MS) || 15_000, 60_000);
              try {
                await financialIntegrity.executeMoneyOperation({
                  userId,
                  idempotencyKey,
                  requireProviderLive: 'stripe',
                  lockTtlMs,
                  fn: async () => {
                    const dupLedger = await db.LedgerEntry.findOne({
                      refType: 'coin_purchase',
                      refId: ledgerRefId,
                    }).lean();
                    if (dupLedger) {
                      return { ok: true, coinsAdded: 0, packId, duplicate: true };
                    }
                    const economy = require('@millo/economy');
                    await economy.credit(userId, totalCoins * 100, 'coin_purchase', ledgerRefId, {
                      packId,
                      totalCoins,
                      stripeSessionId: session.id,
                    });
                    await paymentReferenceService.upsertPaymentReference({
                      provider: 'stripe',
                      referenceId: session.id,
                      userId: userId || null,
                      status: 'completed',
                      amountCents: session.amount_total ?? 0,
                      currency: (session.currency || 'usd').toUpperCase(),
                      metadata: {
                        packId,
                        totalCoins,
                        sessionId: session.id,
                        paymentIntentId: piId || null,
                        source: 'webhook_checkout_session_completed',
                      },
                    }).catch(() => {});
                    kafka.publish(kafka.TOPICS.PAYMENTS, {
                      event: 'coins.purchased',
                      userId: String(userId),
                      packId: String(packId),
                      coinsAdded: totalCoins,
                      paymentIntentId: piId || null,
                      sessionId: session.id,
                    }).catch(() => {});
                    await writeAuditLog({
                      action: 'COIN_PURCHASE_CONFIRMED',
                      actorId: userId,
                      resourceType: 'stripe_checkout_session',
                      resourceId: String(session.id),
                      meta: {
                        packId,
                        coinsAdded: totalCoins,
                        source: 'webhook_checkout_session_completed',
                        paymentIntentId: piId || null,
                      },
                    }).catch(() => {});
                    await notifyUser(userId, {
                      type: 'coinPurchase',
                      title: 'Coins added',
                      body: `You received ${Number(totalCoins) || 0} coins.`,
                      meta: { packId, totalCoins, sessionId: session.id, paymentIntentId: piId || null },
                    }).catch((err) => request.log.error({ err }, 'Webhook: failed to create coinPurchase notification'));
                    trackEvent({
                      name: 'payments.coin_checkout_completed',
                      userId: String(userId),
                      props: {
                        packId,
                        totalCoins,
                        sessionId: session.id,
                        amountCents: session.amount_total ?? 0,
                        currency: (session.currency || 'usd').toUpperCase(),
                      },
                    }).catch(() => {});
                    return { ok: true, coinsAdded: totalCoins, packId };
                  },
                });
              } catch (webhookCsErr) {
                if (webhookCsErr.name === 'FinancialIntegrityError' ||
                    webhookCsErr.code === 'PAYMENTS_NOT_LIVE' ||
                    webhookCsErr.code === 'PAYMENT_PROVIDER_NOT_LIVE') {
                  request.log.warn(
                    { err: webhookCsErr, sessionId: session.id },
                    'checkout.session.completed coin: financial integrity blocked'
                  );
                  return reply.status(200).send({ received: true, skipped: 'financial_integrity' });
                }
                if (webhookCsErr.code === 'IDEMPOTENT_REPLAY') {
                  request.log.warn(
                    { err: webhookCsErr, sessionId: session.id },
                    'checkout.session.completed coin: idempotent failed replay'
                  );
                  return reply.status(200).send({ received: true });
                }
                if (webhookCsErr instanceof LockContentionError) {
                  request.log.warn(
                    { err: webhookCsErr, sessionId: session.id },
                    'checkout.session.completed coin: lock contention'
                  );
                  return reply.status(500).send({ error: 'LOCK_CONTENTION' });
                }
                throw webhookCsErr;
              }
            }
            return reply.status(200).send({ received: true });
          }
          const eventId = session.metadata?.eventId;
          if (eventId) {
            const existingAttendance = await db.EventAttendance.findOne({ eventId, userId }).lean();
            if (!existingAttendance) {
              await db.EventAttendance.create({
                eventId,
                userId,
                ticketPaid: true,
                meta: { stripeSessionId: session.id },
              });
              await notifyUser(userId, {
                type: 'eventTicketPurchased',
                title: 'Ticket purchased',
                body: 'Your event ticket purchase is confirmed.',
                meta: { eventId, ticketPaid: true, stripeSessionId: session.id },
              }).catch(() => {});
            }
            return reply.status(200).send({ received: true });
          }

          // Shop order — create Order, update inventory. Idempotent: skip if order exists for session.
          const existing = await db.Order.findOne({ stripeSessionId: session.id }).lean();
          if (existing) return reply.status(200).send({ received: true });

          let itemsJson = session.metadata?.items || '[]';
          if (itemsJson.length >= 498) itemsJson = itemsJson.replace(/\][^]*$/, ']');
          let parsed;
          try {
            parsed = JSON.parse(itemsJson);
          } catch {
            request.log.warn({ sessionId: session.id, itemsLength: itemsJson?.length }, 'Webhook: invalid items metadata, cannot create order');
            return reply.status(200).send({ received: true });
          }

          const orderItems = [];
          let orderCustomsMode = 'DAP';
          for (const row of parsed) {
            const productId = row.p || row.productId;
            const qty = row.q ?? row.qty ?? 1;
            const priceCents = row.c ?? row.priceCents ?? 0;
            if (!productId) continue;
            const product = await db.Product.findById(productId).lean();
            if (!product) {
              request.log.warn({ productId, sessionId: session.id }, 'Webhook: product not found for order item');
              continue;
            }
            if (orderItems.length === 0) orderCustomsMode = product.customsMode || 'DAP';
            orderItems.push({
              productId: product._id,
              creatorId: product.creatorId,
              name: product.name,
              qty: Math.max(1, Math.round(Number(qty) || 1)),
              priceCents: product.priceCents,
            });
          }

          if (orderItems.length === 0) {
            request.log.warn({ sessionId: session.id }, 'Webhook: no valid order items');
            return reply.status(200).send({ received: true });
          }

          let totalCents = orderItems.reduce((s, i) => s + i.priceCents * i.qty, 0);
          const discountCents = Math.max(0, parseInt(session.metadata?.discountCents, 10) || 0);
          totalCents = Math.max(0, totalCents - discountCents);
          const orderMeta = session.metadata?.couponId ? { couponId: session.metadata.couponId } : {};

          let shipping = {};
          try {
            shipping = JSON.parse(session.metadata?.shipping || '{}');
          } catch { /* ignore */ }

          const order = await createOrderFromItems(userId, orderItems, totalCents, session.id, shipping, orderCustomsMode, orderMeta);
          if (orderMeta.couponId) {
            await db.CreatorCoupon.findByIdAndUpdate(orderMeta.couponId, { $inc: { redemptionCount: 1 } }).catch((err) => request.log.error({ err, couponId: orderMeta.couponId }, 'Webhook: failed to increment coupon redemption'));
          }
          await notifyUser(userId, {
            type: 'orderPlaced',
            title: 'Order confirmed!',
            body: `Your order for $${(totalCents / 100).toFixed(2)} has been placed.`,
            meta: { orderId: String(order._id), totalCents, stripeSessionId: session.id },
          }).catch((err) => request.log.error({ err }, 'Webhook: failed to create orderPlaced notification'));
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        const inv = event.data.object;
        const stripeSdk = getStripe();
        if (!stripeSdk || !inv.subscription) {
          return reply.status(200).send({ received: true });
        }

        const subRef = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
        let subStripe;
        try {
          subStripe = await stripeSdk.subscriptions.retrieve(subRef);
        } catch (err) {
          request.log.warn({ err }, 'invoice.payment_succeeded: subscription retrieve failed');
          return reply.status(200).send({ received: true });
        }

        const md = subStripe.metadata || {};
        if (md.type !== 'creator_subscription' || !isMongoObjectIdString(md.userId) || !isMongoObjectIdString(md.creatorId)) {
          return reply.status(200).send({ received: true });
        }

        const refKey = `creator_sub_inv_${inv.id}`;

        const amountCents = inv.amount_paid || 0;
        if (amountCents <= 0) {
          return reply.status(200).send({ received: true });
        }

        const userId = md.userId;
        const creatorId = md.creatorId;

        try {
          await financialIntegrity.executeMoneyOperation({
            userId: creatorId,
            idempotencyKey: `stripe_${refKey}`,
            requireProviderLive: 'stripe',
            fn: async () => {
              const split = await revenueService.splitRevenueByCreator(creatorId, amountCents, 'subscription');

              if (split.creatorCents > 0) {
                await revenueService.creditWallet(creatorId, split.creatorCents, 'subscription_stripe', refKey, {
                  subscriberId: userId,
                  stripeInvoiceId: inv.id,
                });
              }
              if (split.platformCents > 0) {
                await revenueService.creditPlatform(split.platformCents, 'subscription_stripe', refKey, {
                  creatorId: String(creatorId),
                  subscriberId: userId,
                });
              }

              const periodStart = subStripe.current_period_start ? new Date(subStripe.current_period_start * 1000) : new Date();
              const periodEnd = subStripe.current_period_end ? new Date(subStripe.current_period_end * 1000) : undefined;
              const platformFeePercentMeta = md.platformFeePercent != null ? Number(md.platformFeePercent) : null;
              const creatorSharePercentMeta = md.creatorSharePercent != null ? Number(md.creatorSharePercent) : null;
              const tierOid = isMongoObjectIdString(md.subscriptionTierId) ? md.subscriptionTierId : null;

              await db.Subscription.findOneAndUpdate(
                { externalId: subStripe.id },
                {
                  $set: {
                    userId,
                    creatorId,
                    plan: `creator_stripe_${md.tierId || 'tier'}`,
                    status: 'active',
                    priceCents: amountCents,
                    externalId: subStripe.id,
                    platformFeePercent: platformFeePercentMeta,
                    creatorSharePercent: creatorSharePercentMeta,
                    subscriptionTierId: tierOid || null,
                    billingInterval: md.billingInterval === 'year' ? 'year' : 'month',
                    startsAt: periodStart,
                    endsAt: periodEnd,
                    meta: { stripeCustomerId: subStripe.customer, lastInvoiceId: inv.id },
                  },
                },
                { upsert: true }
              );

              await paymentReferenceService.upsertPaymentReference({
                provider: 'stripe',
                referenceId: refKey,
                userId,
                status: 'completed',
                amountCents,
                currency: (inv.currency || 'usd').toUpperCase(),
                metadata: { creatorId, subscriptionId: subStripe.id, invoiceId: inv.id },
              });

              recordPaymentTransaction?.({
                type: 'subscription',
                grossAmountCents: amountCents,
                platformFeeCents: split.platformCents,
                creatorAmountCents: split.creatorCents,
                userId,
                creatorId,
                status: 'completed',
              }).catch(() => {});

              return { ok: true };
            },
          });
        } catch (webhookMoneyErr) {
          if (webhookMoneyErr.name === 'FinancialIntegrityError' ||
              webhookMoneyErr.code === 'PAYMENTS_NOT_LIVE' ||
              webhookMoneyErr.code === 'PAYMENT_PROVIDER_NOT_LIVE') {
            request.log.warn({ err: webhookMoneyErr, refKey }, 'invoice.payment_succeeded: financial integrity blocked');
            return reply.status(200).send({ received: true, skipped: 'financial_integrity' });
          }
          if (webhookMoneyErr.code === 'IDEMPOTENT_REPLAY') {
            request.log.warn({ err: webhookMoneyErr, refKey }, 'invoice.payment_succeeded: prior attempt failed (idempotent replay)');
            return reply.status(200).send({ received: true });
          }
          if (webhookMoneyErr instanceof LockContentionError) {
            request.log.warn({ err: webhookMoneyErr, refKey }, 'invoice.payment_succeeded: lock contention');
            return reply.status(500).send({ error: 'LOCK_CONTENTION' });
          }
          throw webhookMoneyErr;
        }
      } else if (event.type === 'identity.verification_session.verified' || event.type === 'identity.verification_session.requires_input') {
        const session = event.data.object;
        if (session.metadata?.creator_id) {
          await kycService.checkVerificationStatus(session.id, 'stripe_identity').catch(() => {});
        }
      } else if (event.type === 'customer.subscription.updated') {
        const stripeSub  = event.data.object;
        const externalId = stripeSub.id;
        const userId     = stripeSub.metadata?.userId;
        // Creator monthly plan — extend PlatformCreatorAccess.expiresAt
        if (stripeSub.metadata?.type === 'creator_monthly') {
          const creatorUpgrade = require('../services/creatorUpgradeService');
          await creatorUpgrade.handleSubscriptionUpdated(stripeSub).catch((err) => request.log.error({ err }, 'Webhook: creator upgrade handleSubscriptionUpdated failed'));
          return reply.status(200).send({ received: true });
        }

        // Subscription renewed or changed (e.g. Stripe auto-renew)
        const newStatus  = stripeSub.status === 'active' ? 'active'
          : stripeSub.status === 'canceled'  ? 'cancelled'
          : stripeSub.status === 'past_due'  ? 'expired'
          : null;

        // Extend or update the DB subscription record — critical
        if (externalId) {
          const updates = {};
          if (newStatus) updates.status = newStatus;
          if (stripeSub.current_period_end) {
            updates.endsAt = new Date(stripeSub.current_period_end * 1000);
          }
          if (Object.keys(updates).length) {
            await db.Subscription.findOneAndUpdate(
              { externalId },
              { $set: { ...updates, updatedAt: new Date() } },
            );
          }
        }

        // Send renewal email if just renewed (skip generic copy for per-creator Stripe subs — invoice webhook handles those)
        if (userId && newStatus === 'active' && stripeSub.metadata?.type !== 'creator_subscription' && stripeSub.billing_reason === 'subscription_cycle') {
          const user = await db.User.findById(userId).lean().catch(() => null);
          if (user?.email) {
            sendCustomerEmail({
              template: 'subscription_renewed',
              to:      user.email,
              subject: 'Your Millo subscription has renewed',
              title:   'Subscription renewed',
              body:    `Your Millo subscription has been renewed and is active until ${new Date(stripeSub.current_period_end * 1000).toLocaleDateString()}.`,
              ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/pricing',
              ctaText: 'Manage subscription',
            }).catch((err) => request.log.warn({ err, userId }, 'Webhook: failed to send subscription-renewed email'));
          }
          await notifyUser(userId, {
            type: 'subscriptionRenewed',
            title: 'Subscription renewed',
            body: 'Your Millo subscription was automatically renewed.',
            meta: { externalId, stripeSubscriptionId: stripeSub.id },
          }).catch((err) => request.log.error({ err }, 'Webhook: failed to create subscriptionRenewed notification'));
        }

      } else if (event.type === 'customer.subscription.deleted') {
        const sub    = event.data.object;
        const userId = sub.metadata?.userId;
        // Creator monthly plan canceled — mark PlatformCreatorAccess expired
        if (sub.metadata?.type === 'creator_monthly') {
          const creatorUpgrade = require('../services/creatorUpgradeService');
          await creatorUpgrade.handleSubscriptionDeleted(sub).catch((err) => request.log.error({ err }, 'Webhook: creator upgrade handleSubscriptionDeleted failed'));
          return reply.status(200).send({ received: true });
        }
        if (userId) {
          // Cancellation is critical — let errors surface
          await db.Subscription.findOneAndUpdate(
            { externalId: sub.id },
            { $set: { status: 'cancelled', updatedAt: new Date() } }
          );

          // Notify user their subscription was cancelled
          const user = await db.User.findById(userId).lean().catch(() => null);
          if (user?.email) {
            sendCustomerEmail({
              template: 'subscription_cancelled',
              to:      user.email,
              subject: 'Your Millo subscription has been cancelled',
              title:   'Subscription cancelled',
              body:    'Your Millo subscription has ended. You can resubscribe any time.',
              ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/pricing',
              ctaText: 'Resubscribe',
            }).catch(() => null);
          }
          await notifyUser(userId, {
            type: 'subscriptionCancelled',
            title: 'Subscription cancelled',
            body: 'Your subscription has ended.',
            meta: { stripeSubscriptionId: sub.id },
          }).catch((err) => request.log.error({ err }, 'Webhook: failed to create subscriptionCancelled notification'));
        }

      } else if (event.type === 'charge.refunded') {
        // Handle Stripe-initiated refunds
        const charge  = event.data.object;
        const pi      = charge.payment_intent;
        const userId  = charge.metadata?.userId;
        const refundCents = charge.amount_refunded || 0;

        if (userId && refundCents > 0) {
          // If this was a coin purchase, deduct the coins — critical
          const packId = charge.metadata?.packId;
          if (packId) {
            const totalCoins = pricing.packTotalCoins ? pricing.packTotalCoins(packId) : 0;
            if (totalCoins > 0) {
              await withWalletLock(userId, () =>
                db.Wallet.findOneAndUpdate(
                  { userId },
                  { $inc: { balanceCents: -totalCoins } },
                )
              );
            }
          }

          // Notify user about the refund
          const user = await db.User.findById(userId).lean().catch(() => null);
          if (user?.email) {
            sendCustomerEmail({
              template: 'payment_refund',
              to:      user.email,
              subject: `Refund of $${(refundCents / 100).toFixed(2)} processed`,
              title:   'Refund confirmed',
              body:    `A refund of $${(refundCents / 100).toFixed(2)} has been processed. It may take 5-10 business days to appear in your account.`,
              ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/profile',
              ctaText: 'View account',
            }).catch(() => null);
          }
          await notifyUser(userId, {
            type: 'refund',
            title: 'Refund processed',
            body: `A refund of $${(refundCents / 100).toFixed(2)} has been issued.`,
            meta: { paymentIntentId: pi, refundCents },
          }).catch((err) => request.log.error({ err }, 'Webhook: failed to create refund notification'));

          const complianceAudit = require('../services/complianceAudit.service');
          await complianceAudit.logRefundProcessed({
            userId,
            amountCents: refundCents,
            refType: 'stripe_charge',
            refId: charge.id,
            provider: 'stripe',
            meta: { paymentIntentId: pi || null, packId: packId || null },
          }).catch((err) => request.log.error({ err }, 'Webhook: REFUND_PROCESSED audit log failed'));
        }

      } else if (event.type === 'payment_intent.payment_failed') {
        const pi     = event.data.object;
        const userId = pi.metadata?.userId;
        request.log.warn({ paymentIntentId: pi.id, userId, reason: pi.last_payment_error?.message }, 'payment_intent.payment_failed');
        if (userId) {
          const user = await db.User.findById(userId).lean().catch(() => null);
          if (user?.email) {
            sendCustomerEmail({
              template: 'payment_intent_failed',
              to:      user.email,
              subject: 'Payment failed on Millo',
              title:   'Payment failed',
              body:    `We were unable to process your payment${pi.last_payment_error?.message ? ': ' + pi.last_payment_error.message : '.'} Please update your payment method and try again.`,
              ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/billing',
              ctaText: 'Update payment method',
            }).catch((e) => request.log.warn({ e, userId }, 'Webhook: failed to send payment_failed email'));
          }
          await notifyUser(userId, {
            type: 'paymentFailed',
            title: 'Payment failed',
            body: 'Your payment could not be processed. Please update your payment method.',
            meta: { paymentIntentId: pi.id },
          }).catch((e) => request.log.error({ e }, 'Webhook: failed to create paymentFailed notification'));
        }

      } else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const userId  = invoice.metadata?.userId || invoice.subscription_details?.metadata?.userId;
        request.log.warn({ invoiceId: invoice.id, userId, attempt: invoice.attempt_count }, 'invoice.payment_failed');
        if (userId) {
          // Mark subscription as past_due
          if (invoice.subscription) {
            await db.Subscription.findOneAndUpdate(
              { externalId: invoice.subscription },
              { $set: { status: 'expired', updatedAt: new Date() } }
            ).catch((e) => request.log.error({ e, sub: invoice.subscription }, 'Webhook: failed to mark subscription past_due'));
          }
          const user = await db.User.findById(userId).lean().catch(() => null);
          if (user?.email) {
            sendCustomerEmail({
              template: 'invoice_payment_failed',
              to:      user.email,
              subject: 'Subscription payment failed',
              title:   'We couldn\'t renew your subscription',
              body:    `Payment attempt ${invoice.attempt_count} for your Millo subscription failed. Please update your billing information to keep your access.`,
              ctaUrl:  (process.env.FRONTEND_URL || 'https://milloapp.com') + '/billing',
              ctaText: 'Update billing',
            }).catch((e) => request.log.warn({ e, userId }, 'Webhook: failed to send invoice.payment_failed email'));
          }
          await notifyUser(userId, {
            type: 'invoicePaymentFailed',
            title: 'Subscription payment failed',
            body: 'We couldn\'t renew your subscription. Please update your billing info.',
            meta: { invoiceId: invoice.id, attempt: invoice.attempt_count },
          }).catch((e) => request.log.error({ e }, 'Webhook: failed to create invoicePaymentFailed notification'));
        }

      } else if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.updated' || event.type === 'charge.dispute.closed') {
        const dispute = event.data.object;
        const charge  = dispute.charge;
        const statusMap = { open: 'open', won: 'won', lost: 'lost', warning_closed: 'warning_closed' };
        const status = statusMap[dispute.status] || 'open';
        request.log.warn(
          { disputeId: dispute.id, chargeId: charge, reason: dispute.reason, amount: dispute.amount, status },
          `charge.dispute.${event.type.split('.').pop()} — chargeback monitoring`
        );
        let chargebackDoc = null;
        try {
          chargebackDoc = await db.Chargeback.findOneAndUpdate(
            { stripeDisputeId: dispute.id },
            {
              $set: {
                stripeDisputeId: dispute.id,
                stripeChargeId:  charge,
                amountCents:     dispute.amount || 0,
                currency:        (dispute.currency || 'usd').toLowerCase(),
                status,
                reason:          dispute.reason,
                meta:            { ...(dispute.metadata || {}), lastEvent: event.type },
                updatedAt:       new Date(),
              },
            },
            { upsert: true, new: true }
          );
        } catch (e) {
          request.log.error({ e, disputeId: dispute.id }, 'Webhook: failed to upsert Chargeback');
        }
        if (chargebackDoc) {
          const { processChargeback } = require('../workers/paymentChargebackWorker');
          processChargeback(chargebackDoc, request.log).catch((e) =>
            request.log.error({ e, disputeId: dispute.id }, 'Chargeback worker failed')
          );
        }
        await writeAdminAuditLog({
          adminId:  null,
          action:   `stripe_dispute_${event.type.split('.').pop()}`,
          targetId: null,
          meta: {
            disputeId: dispute.id,
            chargeId:  charge,
            reason:    dispute.reason,
            amount:    dispute.amount,
            currency:  dispute.currency,
            status:    dispute.status,
          },
        });
      }
    } catch (err) {
      request.log.error(err, 'Webhook processing error');
    }

    return reply.send({ received: true });
  }

  /* ── PayPal webhook (verify-webhook-signature) ── */
  async function paypalWebhookHandler(request, reply) {
    const paypalRaw = request.rawBody || JSON.stringify(request.body || {});
    const headers = request.headers;
    const { ok, event, error } = await verifyPayPalWebhookAsync(paypalRaw, headers);
    if (!ok) {
      logWebhookVerifyFailedAudit('paypal', request, error);
      return reply.status(400).send({ error });
    }

    const paypalEventId = event?.id != null ? String(event.id) : '';
    if (paypalEventId) {
      const { first } = await markWebhookFirstSeen('paypal', paypalEventId, Number(process.env.PAYPAL_WEBHOOK_DEDUPE_TTL_SEC) || 172800);
      if (!first) {
        request.log.info({ eventId: paypalEventId }, 'PayPal webhook duplicate delivery (ignored)');
        return reply.send({ received: true, duplicate: true });
      }
    }
    writeAuditLog({
      action: 'WEBHOOK_PAYPAL_EVENT',
      resourceType: 'paypal_event',
      resourceId: paypalEventId || 'unknown',
      meta: { event_type: event?.event_type },
    }).catch((err) => request.log.warn({ err }, 'PayPal webhook ingest audit skipped'));

    try {
      const eventType = event?.event_type;
      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const resource = event?.resource;
        const userId = resource?.supplemental_data?.seller_id || resource?.metadata?.userId;
        const amount = resource?.amount?.value ? Math.round(parseFloat(resource.amount.value) * 100) : 0;
        if (userId && amount > 0) {
          await withWalletLock(userId, () =>
            db.Wallet.findOneAndUpdate(
              { userId },
              { $inc: { balanceCents: amount } },
              { upsert: true }
            )
          );
          await notifyUser(userId, {
            type: 'coinPurchase',
            title: 'Coins added',
            body: `You received ${Number(amount) || 0} coins.`,
            meta: { captureId: resource?.id, totalCoins: amount, provider: 'paypal' },
          }).catch((err) => request.log.error({ err }, 'PayPal webhook: failed to create coinPurchase notification'));
        }
      } else if (eventType === 'PAYMENT.PAYOUTS-ITEM.COMPLETED' || eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED') {
        request.log.info({ eventType, resource: event?.resource }, 'PayPal payout webhook');
      }
    } catch (err) {
      request.log.error(err, 'PayPal webhook processing error');
    }

    return reply.send({ received: true });
  }

  /* ── Wise webhook (X-Signature-SHA256 verification) ── */
  async function wiseWebhookHandler(request, reply) {
    const wiseRawPayload = request.rawBody || JSON.stringify(request.body || {});
    const signature = request.headers['x-signature-sha256'] || request.headers['x-signature'];

    // Get wise provider for webhook verification
    const wiseProvider = getPaymentProvider('wise');
    const { ok, event, error, unverified } = wiseProvider.verifyWebhook(wiseRawPayload, signature);

    if (!ok) {
      request.log.warn({ error }, 'Wise webhook verification failed');
      logWebhookVerifyFailedAudit('wise', request, error);
      return reply.status(400).send({ error: error || 'WEBHOOK_VERIFICATION_FAILED' });
    }

    if (unverified) {
      request.log.warn('Wise webhook processed WITHOUT signature verification (dev mode)');
    }

    const wiseResourceId = event?.data?.resource?.id || event?.data?.transferId || '';
    const wiseDedupeKey =
      [String(event?.event_type || ''), String(wiseResourceId)].filter(Boolean).join(':')
      || crypto.createHash('sha256').update(String(wiseRawPayload)).digest('hex').slice(0, 48);
    if (wiseDedupeKey) {
      const { first } = await markWebhookFirstSeen('wise', wiseDedupeKey, Number(process.env.WISE_WEBHOOK_DEDUPE_TTL_SEC) || 172800);
      if (!first) {
        request.log.info({ key: wiseDedupeKey.slice(0, 80) }, 'Wise webhook duplicate delivery (ignored)');
        return reply.send({ received: true, duplicate: true });
      }
    }
    writeAuditLog({
      action: 'WEBHOOK_WISE_EVENT',
      resourceType: 'wise_event',
      resourceId: wiseDedupeKey.slice(0, 128),
      meta: { event_type: event?.event_type, resourceId: wiseResourceId || null },
    }).catch((err) => request.log.warn({ err }, 'Wise webhook ingest audit skipped'));

    try {
      const result = await wiseProvider.handleWebhook(event);

      if (result.handled) {
        request.log.info({ action: result.action, status: result.status }, 'Wise webhook processed');

        // Send notification if payout completed
        if (result.action === 'transfer_state_updated' && result.status === 'completed') {
          const transferId = event.data?.resource?.id || event.data?.transferId;
          const payout = await db.PayoutRequest.findOne({ externalId: transferId }).lean();
          if (payout) {
            await notifyUser(payout.userId, {
              type: 'payoutCompleted',
              title: 'Payout completed',
              body: `Your Wise payout of ${((payout.amountCents || 0) / 100).toFixed(2)} has been sent.`,
              meta: { payoutId: String(payout._id), transferId, provider: 'wise' },
            }).catch((err) => request.log.warn({ err }, 'Wise webhook: failed to create notification'));
          }
        }

        // Notify on failed payouts
        if (result.action === 'transfer_state_updated' && result.status === 'failed') {
          const transferId = event.data?.resource?.id || event.data?.transferId;
          const payout = await db.PayoutRequest.findOne({ externalId: transferId }).lean();
          if (payout) {
            await notifyUser(payout.userId, {
              type: 'payoutFailed',
              title: 'Payout failed',
              body: 'Your Wise payout could not be completed. Please contact support.',
              meta: { payoutId: String(payout._id), transferId, provider: 'wise' },
            }).catch((err) => request.log.warn({ err }, 'Wise webhook: failed to create notification'));
          }
        }
      } else {
        request.log.info({ eventType: result.eventType || event.event_type }, 'Wise webhook event not handled');
      }

      // Audit log
      await writeAdminAuditLog({
        adminId: null,
        action: `wise_webhook_${event.event_type || 'unknown'}`,
        targetId: null,
        meta: {
          eventType: event.event_type,
          handled: result.handled,
          action: result.action,
        },
      });

    } catch (err) {
      request.log.error(err, 'Wise webhook processing error');
    }

    return reply.send({ received: true });
  }

  webhookBindings.stripe = stripeWebhookHandler;
  webhookBindings.paypal = paypalWebhookHandler;
  webhookBindings.wise = wiseWebhookHandler;
}

module.exports = { paymentsRoutes };
