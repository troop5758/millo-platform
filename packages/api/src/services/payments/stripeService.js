'use strict';
/**
 * Stripe Service — enforces real payment flow, no stubs allowed in production.
 * Coins are ONLY credited via verified webhook events.
 * https://milloapp.com
 */

const db = require('@millo/database');
const { withWalletLock } = require('../../lib/walletLock');

let _stripe = null;

/**
 * Get Stripe client instance.
 * @throws {Error} if Stripe is not configured in production
 * @returns {import('stripe').Stripe|null}
 */
function getStripe() {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_NOT_CONFIGURED: Stripe is required in production. Set STRIPE_SECRET_KEY.');
    }
    console.warn('[StripeService] Stripe disabled — missing STRIPE_SECRET_KEY');
    return null;
  }

  try {
    const Stripe = require('stripe');
    _stripe = new Stripe(key, {
      apiVersion: '2024-04-10',
      appInfo: { name: 'Millo', version: '3.0' },
    });
    return _stripe;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_PACKAGE_MISSING: Install stripe package. Run: npm install stripe');
    }
    console.warn('[StripeService] stripe package not installed');
    return null;
  }
}

/**
 * Check if Stripe is properly configured.
 */
function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Check if running in production without Stripe (forbidden).
 */
function requireStripeInProduction() {
  if (process.env.NODE_ENV === 'production' && !isConfigured()) {
    throw new Error('STRIPE_REQUIRED_IN_PRODUCTION');
  }
}

/**
 * Create a Stripe Checkout session for coin purchase.
 * @param {Object} opts
 * @param {string} opts.userId - User ID
 * @param {number} opts.amountCents - Amount in cents
 * @param {number} opts.coins - Number of coins to credit on success
 * @param {string} opts.packId - Coin pack ID
 * @param {string} [opts.currency='usd'] - Currency code
 * @param {string} [opts.email] - Customer email
 * @returns {Promise<{url: string, sessionId: string}>}
 */
async function createCoinCheckout(opts) {
  const { userId, amountCents, coins, packId, currency = 'usd', email } = opts;

  requireStripeInProduction();
  const stripe = getStripe();

  if (!stripe) {
    // Development only - return stub but DO NOT credit coins
    const stubId = `cs_dev_${Date.now()}_${userId}`;
    console.warn(`[StripeService] DEV STUB checkout ${stubId} - coins will NOT be credited until webhook`);
    return {
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/coins/dev-checkout?stub=${stubId}&pack=${packId}`,
      sessionId: stubId,
      stub: true,
    };
  }

  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://milloapp.com';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Millo Coins - ${coins} coins`,
            description: `Purchase ${coins} Millo coins`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${baseUrl}/coins/success?session_id={CHECKOUT_SESSION_ID}&pack=${packId}&coins=${coins}`,
    cancel_url: `${baseUrl}/coins?cancelled=1`,
    customer_email: email || undefined,
    metadata: {
      userId: String(userId),
      packId: String(packId),
      coins: String(coins),
      type: 'coin_purchase',
    },
  });

  // Log the pending checkout
  await db.FinancialAuditLog.create({
    action: 'stripe_checkout_initiated',
    amountCents,
    refType: 'checkout_session',
    refId: session.id,
    actorId: userId,
    meta: { packId, coins, currency },
  }).catch(() => {});

  return {
    url: session.url,
    sessionId: session.id,
    stub: false,
  };
}

/**
 * Verify Stripe webhook signature and extract event.
 * @param {string|Buffer} payload - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {{ ok: boolean, event?: object, error?: string }}
 */
function verifyWebhook(payload, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
    }
    // Dev mode: parse without verification (dangerous, only for local testing)
    console.warn('[StripeService] DEV MODE: Webhook signature verification skipped');
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
      return { ok: true, event, unverified: true };
    } catch (err) {
      return { ok: false, error: 'INVALID_PAYLOAD' };
    }
  }

  if (!stripe) {
    return { ok: false, error: 'STRIPE_NOT_CONFIGURED' };
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return { ok: true, event };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Process checkout.session.completed event — credit coins to user wallet.
 * This is the ONLY place coins should be credited for purchases.
 * @param {object} session - Stripe checkout session object
 * @returns {Promise<{credited: boolean, userId?: string, coins?: number, error?: string}>}
 */
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const coins = parseInt(session.metadata?.coins, 10);
  const packId = session.metadata?.packId;
  const type = session.metadata?.type;

  if (!userId) {
    console.error('[StripeService] Webhook: missing userId in session metadata');
    return { credited: false, error: 'MISSING_USER_ID' };
  }

  if (type !== 'coin_purchase' || !coins || isNaN(coins) || coins <= 0) {
    // Not a coin purchase or invalid coins value
    return { credited: false, error: 'NOT_COIN_PURCHASE' };
  }

  // Check if already processed (idempotency)
  const existingCredit = await db.LedgerEntry.findOne({
    userId,
    type: 'coin_purchase',
    'meta.sessionId': session.id,
  }).lean();

  if (existingCredit) {
    console.log(`[StripeService] Webhook: session ${session.id} already processed`);
    return { credited: false, error: 'ALREADY_PROCESSED' };
  }

  await withWalletLock(userId, () =>
    db.Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balanceCents: coins } },
      { upsert: true }
    )
  );

  // Record ledger entry
  await db.LedgerEntry.create({
    userId,
    type: 'coin_purchase',
    amountCents: session.amount_total || 0,
    refType: 'stripe_checkout',
    refId: session.id,
    meta: {
      sessionId: session.id,
      paymentIntentId: session.payment_intent,
      packId,
      coins,
      currency: session.currency,
      verified: true,
    },
  });

  // Audit log
  await db.FinancialAuditLog.create({
    action: 'coins_credited_webhook',
    amountCents: session.amount_total || 0,
    refType: 'checkout_session',
    refId: session.id,
    actorId: userId,
    meta: { packId, coins, source: 'stripe_webhook' },
  }).catch(() => {});

  console.log(`[StripeService] Credited ${coins} coins to user ${userId} (session: ${session.id})`);

  return { credited: true, userId, coins };
}

/**
 * Retrieve a checkout session by ID (for verification on success page).
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function getCheckoutSession(sessionId) {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return null;
  }
}

/**
 * Verify that a checkout session was paid (for client-side verification).
 * @param {string} sessionId
 * @returns {Promise<{paid: boolean, coins?: number}>}
 */
async function verifyCheckoutPaid(sessionId) {
  const session = await getCheckoutSession(sessionId);
  if (!session) return { paid: false };

  return {
    paid: session.payment_status === 'paid',
    coins: parseInt(session.metadata?.coins, 10) || 0,
    userId: session.metadata?.userId,
  };
}

module.exports = {
  getStripe,
  isConfigured,
  createCoinCheckout,
  verifyWebhook,
  handleCheckoutCompleted,
  getCheckoutSession,
  verifyCheckoutPaid,
};
