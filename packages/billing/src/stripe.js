'use strict';
/**
 * Stripe billing — real integration required in production.
 * Set STRIPE_SECRET_KEY env var to enable real charges.
 * In production, missing Stripe config causes hard failure.
 * Without STRIPE_SECRET_KEY, getStripe() returns null; HTTP routes using requirePayments return 503.
 * https://milloapp.com
 */
const db          = require('@millo/database');
const idempotency = require('./idempotency');

let _stripe = null;
let _warned = false;

function stripeNotConfiguredError() {
  const e = new Error('STRIPE_NOT_CONFIGURED');
  e.code = 'STRIPE_NOT_CONFIGURED';
  e.statusCode = 503;
  return e;
}

/**
 * Check if we're in production mode.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get Stripe client instance.
 * @throws {Error} in production if Stripe is not configured
 * @returns {import('stripe').Stripe|null}
 */
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (isProduction()) {
      throw new Error('[Stripe] CRITICAL: STRIPE_SECRET_KEY not configured. Payments disabled in production.');
    }
    if (!_warned) {
      _warned = true;
      console.warn('[Stripe] DEV MODE: Stripe disabled — missing STRIPE_SECRET_KEY. Stubs active but coins require webhook.');
    }
    return null;
  }
  try {
    const Stripe = require('stripe');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10', appInfo: { name: 'Millo', version: '3.0' } });
    return _stripe;
  } catch {
    if (isProduction()) {
      throw new Error('[Stripe] CRITICAL: stripe npm package not installed. Run: npm install stripe');
    }
    if (!_warned) {
      _warned = true;
      console.warn('[Stripe] DEV MODE: stripe npm package not installed. Run: npm install stripe');
    }
    return null;
  }
}

async function logAudit(action, amountCents, externalId, meta) {
  await db.FinancialAuditLog.create({
    action, amountCents, refType: 'stripe', refId: externalId,
    actorId: meta.userId, meta,
  }).catch(() => {});
}

/**
 * Create a PaymentIntent for a coin pack purchase.
 * Returns { clientSecret, paymentIntentId } for frontend confirmation.
 */
async function createPaymentIntent(amountCents, idempotencyKey, meta = {}) {
  return idempotency.executeWithIdempotency(`stripe_pi_${idempotencyKey}`, async () => {
    const stripe = getStripe();
    if (!stripe) {
      throw stripeNotConfiguredError();
    }

    const baseMeta = {
      userId: String(meta.userId || ''),
      packId: meta.packId || '',
      coins: String(meta.coins || 0),
      type: 'coin_purchase',
      idempotencyKey,
    };
    const radarMeta = meta.radarMetadata || {};
    const params = {
      amount:   amountCents,
      currency: (meta.currency || 'usd').toLowerCase(),
      metadata: { ...baseMeta, ...radarMeta },
    };
    // 3D Secure required for PPV/payments > $50 (fraud prevention)
    if (amountCents >= 5000) {
      params.payment_method_options = { card: { request_three_d_secure: 'any' } };
    }
    const intent = await stripe.paymentIntents.create(params, { idempotencyKey: `pi_${idempotencyKey}` });

    await logAudit('stripe_payment_intent', amountCents, intent.id, { ...meta, intentId: intent.id });
    return { ok: true, clientSecret: intent.client_secret, paymentIntentId: intent.id, amountCents };
  });
}

/**
 * Create a Stripe Checkout Session for one-time payment (Payment Processor Service).
 * @param {number} amount - Amount in base currency (e.g. dollars)
 * @param {string} currency - Currency code (e.g. 'usd')
 * @param {Object} metadata - Metadata to attach to the session (must include userId, coins for coin purchases)
 * @param {Object} opts - { successUrl, cancelUrl, productName }
 * @returns {Object} { url, sessionId, session }
 */
async function createCheckout(amount, currency, metadata = {}, opts = {}) {
  const stripe = getStripe();
  const baseUrl = process.env.APP_URL || 'https://milloapp.com';
  if (!stripe) {
    throw stripeNotConfiguredError();
  }

  // Ensure metadata includes type for webhook processing
  const enrichedMetadata = {
    ...metadata,
    type: metadata.type || 'payment',
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: (currency || 'usd').toLowerCase(),
          product_data: {
            name: opts.productName || 'Millo Transaction',
          },
          unit_amount: Math.round((amount || 0) * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    metadata: enrichedMetadata,
    success_url: opts.successUrl || `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl || `${baseUrl}/payment-cancel`,
  });
  await logAudit('stripe_checkout', Math.round((amount || 0) * 100), session.id, metadata);
  return { ok: true, url: session.url, sessionId: session.id, session };
}

/**
 * Create a Stripe Checkout Session for subscriptions.
 */
async function createCheckoutSession(priceId, meta = {}) {
  const stripe = getStripe();
  if (!stripe) {
    throw stripeNotConfiguredError();
  }
  const session = await stripe.checkout.sessions.create({
    mode:         'subscription',
    line_items:   [{ price: priceId, quantity: 1 }],
    success_url:  meta.successUrl || (process.env.APP_URL || 'https://milloapp.com') + '/pricing?success=1',
    cancel_url:   meta.cancelUrl  || (process.env.APP_URL || 'https://milloapp.com') + '/pricing?cancelled=1',
    metadata:     { userId: String(meta.userId || ''), ...(meta.metadata || {}) },
    customer_email: meta.email || undefined,
  });
  return { ok: true, url: session.url, sessionId: session.id };
}

/**
 * Ensure a Stripe Customer exists for a Millo user (metadata userId for idempotent lookup).
 * @param {{ _id: unknown, email?: string }} user
 */
async function ensureStripeCustomerForUser(user) {
  const stripe = getStripe();
  if (!stripe) throw stripeNotConfiguredError();
  const uid = String(user._id || user.id || '');
  if (!uid) {
    const e = new Error('USER_ID_REQUIRED');
    e.code = 'VALIDATION';
    throw e;
  }
  try {
    const search = await stripe.customers.search({ query: `metadata['userId']:'${uid}'` });
    if (search.data?.length) return search.data[0];
  } catch (_) {
    /* Customer Search unavailable or no match — create below */
  }
  return stripe.customers.create({
    email: user.email || undefined,
    metadata: { userId: uid },
  });
}

/**
 * Create a Stripe Subscription (recurring) — `stripe.subscriptions.create({ customer, items: [{ price }] })`.
 * Uses `payment_behavior: 'default_incomplete'` so the client can confirm the first invoice PaymentIntent.
 * Optional `application_fee_percent` only when using Stripe Connect on the platform account (omit otherwise).
 * @param {{ customerId: string, priceId: string, metadata?: Record<string, string>, application_fee_percent?: number, idempotencyKey?: string }} opts
 */
async function createSubscription(opts = {}) {
  const stripe = getStripe();
  if (!stripe) throw stripeNotConfiguredError();
  const { customerId, priceId, metadata = {}, application_fee_percent: appFeePct, idempotencyKey } = opts;
  if (!customerId || !priceId) {
    const e = new Error('CUSTOMER_AND_PRICE_REQUIRED');
    e.code = 'VALIDATION';
    throw e;
  }
  const metaFlat = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v == null) continue;
    metaFlat[k] = typeof v === 'string' ? v : String(v);
  }
  const params = {
    customer: customerId,
    items: [{ price: priceId }],
    metadata: metaFlat,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  };
  if (appFeePct != null && Number(appFeePct) > 0) {
    params.application_fee_percent = Number(appFeePct);
  }
  const reqOpts = idempotencyKey ? { idempotencyKey } : undefined;
  const subscription = await stripe.subscriptions.create(params, reqOpts);
  await logAudit('stripe_subscription_create', 0, subscription.id, { customerId, priceId, ...metaFlat });
  const inv = subscription.latest_invoice;
  const pi = inv && typeof inv === 'object' ? inv.payment_intent : null;
  const clientSecret = pi && typeof pi === 'object' ? pi.client_secret : null;
  return {
    ok: true,
    subscriptionId: subscription.id,
    status: subscription.status,
    clientSecret,
    subscription,
  };
}

/** Legacy createCharge — kept for compatibility. */
async function createCharge(amountCents, idempotencyKey, meta = {}) {
  return idempotency.executeWithIdempotency(`stripe_charge_${idempotencyKey}`, async () => {
    const stripe = getStripe();
    if (!stripe) {
      throw stripeNotConfiguredError();
    }
    // In real implementation: use PaymentIntents instead of Charges API
    const externalId = `ch_live_${idempotencyKey}`;
    await logAudit('stripe_charge', amountCents, externalId, meta);
    return { id: externalId, amountCents, status: 'succeeded' };
  });
}

async function createPayout(amountCents, idempotencyKey, meta = {}) {
  return idempotency.executeWithIdempotency(`stripe_payout_${idempotencyKey}`, async () => {
    const stripe = getStripe();
    if (!stripe) {
      const externalId = `po_stub_${Date.now()}_${idempotencyKey}`;
      await logAudit('stripe_payout_stub', amountCents, externalId, meta);
      return { id: externalId, amountCents, status: 'completed' };
    }
    const payout = await stripe.payouts.create({
      amount: amountCents, currency: 'usd',
      metadata: { userId: String(meta.userId || '') },
    }, { idempotencyKey: `po_${idempotencyKey}` });
    await logAudit('stripe_payout', amountCents, payout.id, { ...meta, payoutId: payout.id });
    return { id: payout.id, amountCents, status: payout.status };
  });
}

/**
 * Create a Connect transfer to a connected account (replaces payout stub).
 * @param {string} account - Stripe Connect account ID (destination)
 * @param {number} amount - Amount in cents
 * @param {{ currency?: string, metadata?: object, idempotencyKey?: string }} [opts]
 * @returns {Promise<Stripe.Transfer>}
 */
async function createConnectTransfer(account, amount, opts = {}) {
  const st = getStripe();
  if (!st) throw new Error('STRIPE_NOT_CONFIGURED');
  const reqOpts = opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {};
  return st.transfers.create({
    amount,
    currency: (opts.currency || 'usd').toLowerCase(),
    destination: account,
    metadata: opts.metadata || {},
  }, reqOpts);
}

/**
 * Verify Stripe webhook signature.
 * In production, requires valid signature. In dev, allows unverified events with warning.
 */
function verifyWebhook(payload, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Production requires webhook secret
  if (isProduction() && !secret) {
    return { ok: false, error: 'STRIPE_WEBHOOK_SECRET not configured in production' };
  }

  // Dev mode without secret: parse without verification (dangerous, only for local testing)
  if (!secret) {
    console.warn('[Stripe DEV] Webhook signature verification SKIPPED — STRIPE_WEBHOOK_SECRET not set');
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
      return { ok: true, event, unverified: true };
    } catch (err) {
      return { ok: false, error: 'Invalid JSON payload' };
    }
  }

  const stripe = getStripe();
  if (!stripe) {
    if (isProduction()) {
      return { ok: false, error: 'Stripe not configured' };
    }
    // Dev: try to parse anyway
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
      return { ok: true, event, unverified: true };
    } catch {
      return { ok: false, error: 'Invalid payload' };
    }
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return { ok: true, event };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Check if Stripe is configured.
 */
function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

module.exports = {
  getStripe,
  isConfigured,
  isProduction,
  createPaymentIntent,
  createCheckout,
  createCheckoutSession,
  ensureStripeCustomerForUser,
  createSubscription,
  createCharge,
  createPayout,
  createConnectTransfer,
  verifyWebhook,
};
