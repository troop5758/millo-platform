'use strict';
/**
 * Production Truth Layer (PTL) — single vocabulary for capability state.
 * DISABLED: treat as off / hidden from “fully operational” guarantees
 * BETA: partially configured or stub (visible with warning; not LIVE)
 * LIVE: configured for real processing per Millo provider rules
 *
 * Builds on packages/api/src/lib/providerState.js (payments, AI, KYC),
 * packages/api/src/utils/providerStatus.js (email), and oauthProviders (Google / social).
 * https://milloapp.com
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

function requireProviderState() {
  return require(path.join(REPO_ROOT, 'packages/api/src/lib/providerState'));
}

function requireProviderStatus() {
  return require(path.join(REPO_ROOT, 'packages/api/src/utils/providerStatus'));
}

/**
 * Push (Expo / FCM) — LIVE when at least one server credential is set.
 */
function resolvePush() {
  try {
    const { getPushStatus } = requireProviderStatus();
    const p = getPushStatus();
    if (p.mode === 'live') {
      return { status: 'LIVE', detail: { fcm: p.fcm, expo: p.expo } };
    }
    return { status: 'DISABLED', detail: p };
  } catch (err) {
    return { status: 'DISABLED', detail: { error: err?.message || 'push_unavailable' } };
  }
}

function requireStripe() {
  return require(path.join(REPO_ROOT, 'packages/billing/src/stripe'));
}

function requireOAuthProviders() {
  return require(path.join(REPO_ROOT, 'packages/api/src/services/oauthProviders'));
}

/**
 * OAuth / social login — LIVE when Google is fully configured (client id + secret rules).
 * BETA when another provider is configured but not Google. Web gates Google on oauth.status === LIVE.
 */
function resolveOAuth() {
  try {
    const oauthProviders = requireOAuthProviders();
    const google = oauthProviders.isProviderConfigured('google');
    const facebook = oauthProviders.isProviderConfigured('facebook');
    const apple = oauthProviders.isProviderConfigured('apple');
    if (google) {
      return { status: 'LIVE', detail: { google: true, facebook, apple } };
    }
    if (facebook || apple || oauthProviders.hasAnyOAuthProvider()) {
      return {
        status: 'BETA',
        detail: { google: false, facebook, apple, enabled: oauthProviders.getEnabledProviders() },
      };
    }
    return { status: 'DISABLED', detail: { google: false, facebook: false, apple: false } };
  } catch (err) {
    return { status: 'DISABLED', detail: { error: err?.message || 'oauth_unavailable' } };
  }
}

/**
 * @returns {{ status: 'LIVE'|'BETA'|'DISABLED', detail?: object|string }}
 */
function resolvePayments() {
  const { getPaymentsState } = requireProviderState();
  const p = getPaymentsState();
  if (p.mode === 'live') return { status: 'LIVE', detail: { stripe: p.stripe, paypal: p.paypal, wise: p.wise } };
  if (p.mode === 'stub') return { status: 'BETA', detail: p };
  return { status: 'DISABLED', detail: p };
}

/**
 * Payouts: LIVE when operator sets STRIPE_PAYOUTS=true and Stripe is configured (Connect path).
 * Other payout rails (PayPal/Wise) can still be BETA until explicitly promoted.
 */
function resolvePayouts() {
  let stripeConfigured = false;
  try {
    stripeConfigured = !!requireStripe().getStripe();
  } catch (_) {
    stripeConfigured = false;
  }
  const payoutsLive = process.env.STRIPE_PAYOUTS === 'true';
  const wise = !!process.env.WISE_API_TOKEN;
  const paypal = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

  if (payoutsLive && stripeConfigured) {
    return { status: 'LIVE', detail: { rail: 'stripe_connect' } };
  }
  if (wise || paypal) {
    return { status: 'BETA', detail: { stripeConfigured, wise, paypal, needStripePayoutsFlag: payoutsLive } };
  }
  if (stripeConfigured || payoutsLive) {
    return { status: 'BETA', detail: 'Set STRIPE_PAYOUTS=true with live Stripe for LIVE payouts.' };
  }
  return { status: 'DISABLED' };
}

function resolveAiModeration() {
  const { getAiModerationState } = requireProviderState();
  const s = getAiModerationState();
  if (s.mode === 'live') return { status: 'LIVE', detail: s };
  if (s.mode === 'stub') return { status: 'BETA', detail: s };
  return { status: 'DISABLED', detail: s };
}

function resolveKyc() {
  const { getKycState } = requireProviderState();
  const s = getKycState();
  const provider = (process.env.KYC_PROVIDER || 'none').toLowerCase().replace(/-/g, '_');

  if (s.mode === 'live') return { status: 'LIVE', detail: s };

  if (provider && provider !== 'none') {
    return { status: 'BETA', detail: { ...s, kycProviderEnv: provider } };
  }
  return { status: 'DISABLED', detail: s };
}

function resolveEmail() {
  const { getEmailStatus } = requireProviderStatus();
  const m = getEmailStatus();
  if (m === 'live') return { status: 'LIVE' };
  return { status: 'DISABLED', detail: m };
}

/**
 * Fraud / abuse signals: Cloudflare IP reputation is the primary env-gated layer.
 * In-app rules (gifts, payments, etc.) may still run; this badge reflects the **reputation** rail honesty.
 */
function resolveFraudProtection() {
  const { getCloudflareReputationStatus } = requireProviderStatus();
  const cf = getCloudflareReputationStatus();
  if (cf === 'live') return { status: 'LIVE', detail: { cloudflareIpReputation: true } };
  if (cf === 'unconfigured') {
    return { status: 'BETA', detail: { cloudflare: 'unconfigured', note: 'baseline_fraud_logic_may_still_apply' } };
  }
  return { status: 'BETA', detail: { cloudflare: 'disabled_or_off', note: 'baseline_fraud_logic_may_still_apply' } };
}

/**
 * Fresh snapshot (safe for long-lived processes if env changes in tests).
 * @returns {Record<string, { status: 'LIVE'|'BETA'|'DISABLED', detail?: unknown }>}
 */
function getProductionTruth() {
  return {
    payments: resolvePayments(),
    payouts: resolvePayouts(),
    aiModeration: resolveAiModeration(),
    kyc: resolveKyc(),
    email: resolveEmail(),
    push: resolvePush(),
    oauth: resolveOAuth(),
    fraudProtection: resolveFraudProtection(),
  };
}

/** @type {readonly string[]} */
const FEATURE_KEYS = Object.freeze([
  'payments',
  'payouts',
  'aiModeration',
  'kyc',
  'email',
  'push',
  'oauth',
  'fraudProtection',
]);

/**
 * Back-compat object: getters re-evaluate on each property read.
 */
const ProductionTruth = new Proxy(
  {},
  {
    get(_, key) {
      const t = getProductionTruth();
      return t[key];
    },
    ownKeys() {
      return [...FEATURE_KEYS];
    },
    getOwnPropertyDescriptor(_, key) {
      if (!FEATURE_KEYS.includes(key)) return undefined;
      return { enumerable: true, configurable: true };
    },
  }
);

module.exports = {
  ProductionTruth,
  getProductionTruth,
  FEATURE_KEYS,
  resolvePayments,
  resolvePayouts,
  resolveAiModeration,
  resolveKyc,
  resolveEmail,
  resolvePush,
  resolveOAuth,
  resolveFraudProtection,
};
