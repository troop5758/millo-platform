'use strict';
/**
 * Creator Upgrade Service — Hybrid model: $4.99/month or $69 lifetime.
 * Free users can watch, like, follow, join livestreams, send/receive gifts, buy products.
 * Creators (monthly or lifetime) can host livestreams, monetize, storefronts, auctions, paid meetings.
 * https://milloapp.com
 */

const db = require('@millo/database');

// Default pricing (cents)
const CREATOR_MONTHLY_CENTS = 499;   // $4.99/month
const CREATOR_LIFETIME_CENTS = 6900; // $69 one-time
const CREATOR_LIFETIME_LAUNCH_CENTS = 4900; // $49 launch discount
const CREATOR_LIFETIME_LAUNCH_CAP = 10000;  // first 10,000 creators

let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const Stripe = require('stripe');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10', appInfo: { name: 'Millo', version: '3.0' } });
    return _stripe;
  } catch {
    return null;
  }
}

/**
 * Resolve pricing from platform settings or defaults.
 */
async function getPricing() {
  try {
    const monthly = await db.PlatformSetting.findOne({ key: 'creator_monthly_cents' }).lean();
    const lifetime = await db.PlatformSetting.findOne({ key: 'creator_lifetime_cents' }).lean();
    const launchPrice = await db.PlatformSetting.findOne({ key: 'creator_lifetime_launch_cents' }).lean();
    const launchCap = await db.PlatformSetting.findOne({ key: 'creator_lifetime_launch_cap' }).lean();

    const monthlyCents = monthly?.value != null ? Number(monthly.value) : CREATOR_MONTHLY_CENTS;
    const lifetimeCentsDefault = lifetime?.value != null ? Number(lifetime.value) : CREATOR_LIFETIME_CENTS;
    const launchCents = launchPrice?.value != null ? Number(launchPrice.value) : CREATOR_LIFETIME_LAUNCH_CENTS;
    const launchCapCount = launchCap?.value != null ? Number(launchCap.value) : CREATOR_LIFETIME_LAUNCH_CAP;

    const lifetimeUnlocksCount = await db.PlatformCreatorAccess.countDocuments({ type: 'lifetime', status: 'active' });
    const useLaunchPrice = lifetimeUnlocksCount < launchCapCount;
    const lifetimeCents = useLaunchPrice ? launchCents : lifetimeCentsDefault;

    return {
      monthlyCents,
      lifetimeCents,
      launchDiscount: useLaunchPrice && launchCents < lifetimeCentsDefault,
      launchPriceCents: launchCents,
      launchSlotsLeft: Math.max(0, launchCapCount - lifetimeUnlocksCount),
    };
  } catch {
    return {
      monthlyCents: CREATOR_MONTHLY_CENTS,
      lifetimeCents: CREATOR_LIFETIME_CENTS,
      launchDiscount: false,
      launchPriceCents: CREATOR_LIFETIME_LAUNCH_CENTS,
      launchSlotsLeft: 0,
    };
  }
}

/**
 * GET upgrade options for the upgrade page.
 */
async function getUpgradeOptions() {
  const pricing = await getPricing();
  return {
    free: {
      plan: 'Free User',
      price: 0,
      priceCents: 0,
      interval: null,
      bestFor: 'Watching and interacting',
      features: [
        'Watch short videos',
        'Like / comment',
        'Follow creators',
        'Join livestreams',
        'Send gifts',
        'Receive gifts',
        'Buy products or auctions',
      ],
      restrictions: [
        'Cannot host livestreams',
        'Cannot monetize content',
        'Cannot create storefronts',
        'Cannot run auctions',
        'Cannot schedule paid meetings',
        'Cannot upload monetized shorts',
      ],
    },
    monthly: {
      plan: 'Creator Monthly',
      price: pricing.monthlyCents / 100,
      priceCents: pricing.monthlyCents,
      interval: 'month',
      bestFor: 'Active creators',
      cta: 'Start Creator Monthly',
      features: [
        'Host livestreams',
        'Receive gifts',
        'Upload monetized shorts',
        'Create storefront',
        'Run auctions',
        'Schedule paid meetings',
        'Creator analytics',
        'Creator badges',
        'Priority discovery ranking',
      ],
    },
    lifetime: {
      plan: 'Creator Lifetime',
      price: pricing.lifetimeCents / 100,
      priceCents: pricing.lifetimeCents,
      oneTime: true,
      bestFor: 'Long-term creators',
      cta: 'Unlock Lifetime Creator',
      launchDiscount: pricing.launchDiscount,
      launchPrice: pricing.launchDiscount ? pricing.launchPriceCents / 100 : null,
      launchSlotsLeft: pricing.launchSlotsLeft,
      features: [
        'All creator features permanently',
        'Host livestreams',
        'Receive gifts',
        'Upload monetized shorts',
        'Create storefront',
        'Run auctions',
        'Schedule paid meetings',
        'Creator analytics',
        'Creator badges',
        'Priority discovery ranking',
      ],
    },
  };
}

/**
 * Create Stripe Checkout for creator upgrade (monthly subscription or one-time lifetime).
 */
async function createCheckout(userId, type, opts = {}) {
  if (!['monthly', 'lifetime'].includes(type)) {
    throw new Error('Invalid type. Use "monthly" or "lifetime".');
  }
  const stripe = getStripe();
  if (!stripe) {
    if (process.env.NODE_ENV === 'production') throw new Error('STRIPE_NOT_CONFIGURED');
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
    return {
      url: `${baseUrl}/creator/upgrade?stub=1&type=${type}`,
      sessionId: `cs_creator_stub_${Date.now()}`,
      stub: true,
    };
  }

  const pricing = await getPricing();
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://milloapp.com';
  const successUrl = `${baseUrl}/creator/upgrade/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = opts.cancelUrl || `${baseUrl}/creator/upgrade?cancelled=1`;

  if (type === 'lifetime') {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Millo Creator — Lifetime Unlock',
            description: 'Unlock all creator features permanently: host livestreams, monetize, storefronts, auctions, paid meetings.',
            images: opts.imageUrl ? [opts.imageUrl] : undefined,
          },
          unit_amount: pricing.lifetimeCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: opts.email || undefined,
      metadata: {
        userId: String(userId),
        type: 'creator_lifetime',
      },
    });
    return { url: session.url, sessionId: session.id };
  }

  // Monthly subscription
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Millo Creator — Monthly Plan',
          description: 'Creator features: host livestreams, monetize, storefronts, auctions, paid meetings. Billed monthly.',
        },
        unit_amount: pricing.monthlyCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: opts.email || undefined,
    metadata: {
      userId: String(userId),
      type: 'creator_monthly',
    },
    subscription_data: {
      metadata: { userId: String(userId), type: 'creator_monthly' },
    },
  });
  return { url: session.url, sessionId: session.id };
}

/**
 * Grant creator access and set user creatorStatus/role. Idempotent by userId+type.
 */
async function grantCreatorAccess(userId, type, stripeData = {}) {
  const pricing = await getPricing();
  const amountCents = type === 'lifetime' ? pricing.lifetimeCents : pricing.monthlyCents;

  await db.PlatformCreatorAccess.findOneAndUpdate(
    {
      userId,
      type,
      status: 'active',
    },
    {
      $set: {
        userId,
        type,
        status: 'active',
        amountCents,
        currency: 'USD',
        stripeSubscriptionId: stripeData.subscriptionId || null,
        stripePriceId: stripeData.priceId || null,
        stripeCustomerId: stripeData.customerId || null,
        stripeSessionId: stripeData.sessionId || null,
        stripePaymentIntentId: stripeData.paymentIntentId || null,
        expiresAt: stripeData.expiresAt || null,
        canceledAt: null,
        meta: stripeData.meta || {},
      },
    },
    { upsert: true }
  );

  await db.User.updateOne(
    { _id: userId },
    { $set: { creatorStatus: 'approved', role: 'creator' } }
  );

  await db.Profile.updateOne(
    { userId },
    {
      $set: { creatorVerifiedAt: new Date() },
      $addToSet: { badges: { badgeId: 'verified_creator', label: 'Verified Creator', icon: 'check' } },
    }
  ).catch(() => {});

  await db.FinancialAuditLog.create({
    action: 'creator_upgrade_granted',
    amountCents,
    refType: 'platform_creator_access',
    refId: `${userId}_${type}`,
    actorId: userId,
    meta: { type, ...stripeData },
  }).catch(() => {});
}

/**
 * Handle Stripe checkout.session.completed for creator_monthly / creator_lifetime.
 */
async function handleCheckoutCompleted(session) {
  const type = session.metadata?.type;
  const userId = session.metadata?.userId;
  if (!userId || (type !== 'creator_monthly' && type !== 'creator_lifetime')) return null;

  if (type === 'creator_lifetime') {
    await grantCreatorAccess(userId, 'lifetime', {
      sessionId: session.id,
      customerId: session.customer,
      paymentIntentId: session.payment_intent,
      meta: { mode: 'payment' },
    });
    return { userId, type: 'lifetime' };
  }

  // creator_monthly: subscription created; we'll set expiresAt on subscription.updated or invoice.paid
  const subscriptionId = session.subscription;
  if (!subscriptionId) return null;

  const stripe = getStripe();
  let expiresAt = null;
  if (stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = sub.current_period_end;
      expiresAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
    } catch (_) {}
  }

  await grantCreatorAccess(userId, 'monthly', {
    subscriptionId,
    sessionId: session.id,
    customerId: session.customer,
    expiresAt,
    meta: { mode: 'subscription' },
  });
  return { userId, type: 'monthly', subscriptionId };
}

/**
 * Handle subscription updated (renewal) — extend expiresAt.
 */
async function handleSubscriptionUpdated(subscription) {
  if (subscription.metadata?.type !== 'creator_monthly') return null;
  const userId = subscription.metadata?.userId;
  if (!userId) return null;

  const currentPeriodEnd = subscription.current_period_end;
  const expiresAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;

  await db.PlatformCreatorAccess.updateOne(
    { userId, stripeSubscriptionId: subscription.id, status: 'active' },
    { $set: { expiresAt } }
  );
  return { userId };
}

/**
 * Handle subscription deleted (canceled/expired) — mark access expired.
 */
async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata?.userId;
  const updated = await db.PlatformCreatorAccess.updateOne(
    { stripeSubscriptionId: subscription.id, status: 'active' },
    { $set: { status: 'expired', canceledAt: new Date() } }
  );
  if (updated.modifiedCount && userId) {
    await ensureUserCreatorStatus(String(userId));
  }
  return { userId };
}

/**
 * Recompute user creatorStatus/role from any active PlatformCreatorAccess or application.
 */
async function ensureUserCreatorStatus(userId) {
  const hasActiveAccess = await db.PlatformCreatorAccess.findOne({
    userId,
    status: 'active',
    $or: [
      { type: 'lifetime' },
      { type: 'monthly', expiresAt: { $gt: new Date() } },
    ],
  }).lean();
  if (hasActiveAccess) {
    await db.User.updateOne({ _id: userId }, { $set: { creatorStatus: 'approved', role: 'creator' } });
    return;
  }
  const app = await db.CreatorApplication.findOne({ userId, status: 'approved' }).lean();
  if (app) {
    await db.User.updateOne({ _id: userId }, { $set: { creatorStatus: 'approved', role: 'creator' } });
    return;
  }
  await db.User.updateOne(
    { _id: userId },
    { $set: { creatorStatus: 'none', role: 'user' } }
  );
}

/**
 * Check if user has active creator access (monthly not expired, or lifetime).
 */
async function hasActiveCreatorAccess(userId) {
  const access = await db.PlatformCreatorAccess.findOne({
    userId,
    status: 'active',
  }).lean();
  if (!access) return false;
  if (access.type === 'lifetime') return true;
  if (access.type === 'monthly' && access.expiresAt) return access.expiresAt > new Date();
  return true;
}

/**
 * Get current user's creator access record (for settings page).
 */
async function getCreatorAccess(userId) {
  const access = await db.PlatformCreatorAccess.findOne({ userId }).sort({ createdAt: -1 }).lean();
  if (!access) return null;
  const active = access.status === 'active' && (access.type === 'lifetime' || (access.expiresAt && access.expiresAt > new Date()));
  return {
    type: access.type,
    status: access.status,
    active,
    expiresAt: access.expiresAt,
    amountCents: access.amountCents,
    createdAt: access.createdAt,
  };
}

module.exports = {
  CREATOR_MONTHLY_CENTS,
  CREATOR_LIFETIME_CENTS,
  CREATOR_LIFETIME_LAUNCH_CENTS,
  CREATOR_LIFETIME_LAUNCH_CAP,
  getPricing,
  getUpgradeOptions,
  createCheckout,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  grantCreatorAccess,
  ensureUserCreatorStatus,
  hasActiveCreatorAccess,
  getCreatorAccess,
  getStripe,
};
