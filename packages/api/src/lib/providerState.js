'use strict';
/**
 * Consistent provider / stub / env-gated state for APIs and GET /health.
 * Modes: live | stub | disabled | unconfigured
 * https://milloapp.com
 */

/**
 * @typedef {'live'|'stub'|'disabled'|'unconfigured'} ProviderMode
 */

/**
 * @param {boolean} configured
 * @param {boolean} [stubWhenUnconfigured]
 * @returns {{ mode: ProviderMode, providerConfigured: boolean }}
 */
function classifyPaymentMode(configured, stubWhenUnconfigured = true) {
  if (configured) return { mode: 'live', providerConfigured: true };
  if (stubWhenUnconfigured) return { mode: 'stub', providerConfigured: false };
  return { mode: 'unconfigured', providerConfigured: false };
}

function getStripeConfigured() {
  try {
    const { getStripe } = require('@millo/billing/src/stripe');
    return !!getStripe();
  } catch {
    return false;
  }
}

function getPaymentsState() {
  const stripe = getStripeConfigured();
  const paypal = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const wise = !!process.env.WISE_API_TOKEN;
  const anyLive = stripe || paypal || wise;
  /** Production: no "stub" mode — unconfigured rails are not LIVE (fail-closed for merchant flows). */
  const allowStub = process.env.NODE_ENV !== 'production';
  const base = classifyPaymentMode(anyLive, allowStub);
  return {
    ...base,
    stripe: stripe ? 'live' : 'unconfigured',
    paypal: paypal ? 'live' : 'unconfigured',
    wise: wise ? 'live' : 'unconfigured',
    /** Coin top-ups: real card flow needs Stripe; internal coin references work without. */
    coinPurchasePath: stripe ? 'stripe_checkout' : 'internal_stub_only',
    paypalPayouts: paypal ? 'live' : 'unconfigured',
    wisePayouts: wise ? 'live' : 'unconfigured',
    wiseWebhook: process.env.WISE_WEBHOOK_SECRET
      ? 'verified'
      : process.env.NODE_ENV === 'production'
        ? 'unconfigured'
        : 'dev_unverified',
  };
}

function getOAuthState() {
  const { isProviderConfigured } = require('../services/oauthProviders');
  const google = isProviderConfigured('google');
  const facebook = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  const apple = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID);
  const any = google || facebook || apple;
  return {
    mode: any ? 'live' : 'unconfigured',
    providerConfigured: any,
    google: google ? 'live' : 'unconfigured',
    facebook: facebook ? 'live' : 'unconfigured',
    apple: apple ? 'live' : 'unconfigured',
  };
}

function getAiModerationState() {
  const enabled = process.env.AI_MODERATION_ENABLED === 'true';
  const openai = !!process.env.OPENAI_API_KEY;
  const hive = !!process.env.HIVE_API_KEY;
  if (!enabled) return { mode: 'disabled', providerConfigured: false, detail: 'AI_MODERATION_ENABLED not true' };
  if (openai || hive) return { mode: 'live', providerConfigured: true, openai: openai ? 'live' : 'off', hive: hive ? 'live' : 'off' };
  return { mode: 'stub', providerConfigured: false, detail: 'no_openai_or_hive' };
}

function getKycState() {
  const onfido = !!process.env.ONFIDO_API_TOKEN;
  const sumsub = !!(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
  if (onfido || sumsub) return { mode: 'live', providerConfigured: true };
  return { mode: 'stub', providerConfigured: false };
}

/**
 * Full snapshot for health checks and optional client diagnostics.
 */
function getProviderStateSnapshot() {
  return {
    payments: getPaymentsState(),
    oauth: getOAuthState(),
    aiModeration: getAiModerationState(),
    kyc: getKycState(),
    ts: new Date().toISOString(),
  };
}

/**
 * Attach compact flags to a Fastify reply (e.g. payment endpoints).
 * @param {import('fastify').FastifyReply} reply
 * @param {Record<string, unknown>} [extra]
 */
function appendProviderHeaders(reply, extra = {}) {
  const p = getPaymentsState();
  reply.header('X-Millo-Payment-Mode', p.mode);
  reply.header('X-Millo-Payment-Configured', p.providerConfigured ? 'true' : 'false');
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && typeof v === 'string' && k.startsWith('X-')) reply.header(k, v);
    }
  }
}

module.exports = {
  getProviderStateSnapshot,
  getPaymentsState,
  getOAuthState,
  getAiModerationState,
  getKycState,
  appendProviderHeaders,
  classifyPaymentMode,
};
