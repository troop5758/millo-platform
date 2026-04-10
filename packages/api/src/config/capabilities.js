'use strict';
/**
 * Central capability registry — env-derived booleans only (no secrets).
 * Single source for GET /system/capabilities and payment-route guards.
 * Trust badges mirror Production Truth (LIVE / BETA / DISABLED) so UI can match enforcement.
 * https://milloapp.com
 */

const path = require('path');
const oauthProviders = require('../services/oauthProviders');
const { getPushStatus } = require('../utils/providerStatus');

function getTrustSurface() {
  try {
    const { getProductionTruth } = require(path.join(__dirname, '../../../../config/production-truth.js'));
    const t = getProductionTruth();
    return {
      payments: t.payments?.status || 'DISABLED',
      payouts: t.payouts?.status || 'DISABLED',
      kyc: t.kyc?.status || 'DISABLED',
      aiModeration: t.aiModeration?.status || 'DISABLED',
      fraudProtection: t.fraudProtection?.status || 'DISABLED',
      email: t.email?.status || 'DISABLED',
      oauth: t.oauth?.status || 'DISABLED',
      push: t.push?.status || 'DISABLED',
    };
  } catch {
    return {
      payments: 'DISABLED',
      payouts: 'DISABLED',
      kyc: 'DISABLED',
      aiModeration: 'DISABLED',
      fraudProtection: 'DISABLED',
      email: 'DISABLED',
      oauth: 'DISABLED',
      push: 'DISABLED',
    };
  }
}

/**
 * @returns {{
 *   infra: {
 *     kafkaBrokersConfigured: boolean,
 *     kafkaEventBusEnabled: boolean,
 *     redis: boolean,
 *     relationalSqlConfigured: boolean,
 *     primaryDatabase: 'mongodb',
 *   },
 *   payments: { stripe: boolean, paypal: boolean, wise: boolean, anyConfigured: boolean },
 *   auth: { oauth: boolean, oauthGoogle: boolean },
 *   live: { janus: boolean },
 *   moderation: { ai: boolean },
 *   milla: { featureEnabled: boolean, llmConfigured: boolean, chatAvailable: boolean },
 *   notifications: { email: boolean, push: boolean }
 * }}
 */
function getCapabilities() {
  const emailProv = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase().replace(/-/g, '_');
  const push = getPushStatus();
  const aiExplicit = process.env.AI_MODERATION === 'true';
  const aiEnabledFlag = process.env.AI_MODERATION_ENABLED === 'true';
  const aiKeys = !!(process.env.OPENAI_API_KEY || process.env.HIVE_API_KEY);

  const trust = getTrustSurface();

  const stripe = !!String(process.env.STRIPE_SECRET_KEY || '').trim();
  const paypal = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const wise = !!String(process.env.WISE_API_TOKEN || '').trim();

  const kafkaBrokersConfigured = !!(process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER);
  const kafkaEventBusEnabled = process.env.KAFKA_ENABLED === 'true';

  const sqlHint =
    process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRESQL_URL
    || process.env.MYSQL_URL
    || process.env.SQL_DATABASE_URL;
  const relationalSqlConfigured = !!(sqlHint && String(sqlHint).trim());

  const millaFeatureOn = process.env.MILLA_ENABLED !== 'false';
  const millaLlm = !!(process.env.OPENAI_API_KEY || process.env.MILLA_API_KEY);

  return {
    infra: {
      /** Brokers present in env — does not imply consumers/producers are running. */
      kafkaBrokersConfigured,
      /** API event bus actually uses Kafka (KAFKA_ENABLED=true). */
      kafkaEventBusEnabled,
      /** @deprecated Same as kafkaEventBusEnabled — was ambiguous vs brokers-only. */
      kafka: kafkaEventBusEnabled,
      redis: !!(process.env.REDIS_URL || process.env.REDIS_URI || process.env.REDIS_HOST),
      /** Optional relational URL present (Millo core data stays on MongoDB). */
      relationalSqlConfigured,
      primaryDatabase: 'mongodb',
    },
    payments: {
      stripe,
      paypal,
      wise,
      anyConfigured: stripe || paypal || wise,
    },
    auth: {
      oauth: oauthProviders.hasAnyOAuthProvider(),
      oauthGoogle: !!String(
        process.env.OAUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
      ).trim(),
    },
    live: {
      janus: !!(process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL),
    },
    moderation: {
      ai: aiExplicit || (aiEnabledFlag && aiKeys),
    },
    /** Milla virtual host: toggle + LLM keys; co-host/gifts still respect stream state. */
    milla: {
      featureEnabled: millaFeatureOn,
      llmConfigured: millaLlm,
      chatAvailable: millaFeatureOn && millaLlm,
    },
    notifications: {
      email: !!emailProv && emailProv !== 'console',
      push: push.mode === 'live',
    },
    /** LIVE | BETA | DISABLED — clients must not imply protection when DISABLED. */
    trust,
  };
}

/**
 * Paths that are part of the payments surface and require a configured payment rail when enabled.
 * Accepts gateway-prefixed paths (e.g. `/api/payments/...`).
 * @param {string} pathname - path without query string
 * @returns {boolean}
 */
function isPaymentSurfacePath(pathname) {
  let p = String(pathname || '');
  if (p.startsWith('/api/')) p = `/${p.slice(5)}` || '/';
  if (p.startsWith('/payments')) return true;
  if (p.startsWith('/money')) return true;
  if (p === '/payout/batch') return true;
  if (p === '/webhooks/stripe' || p.startsWith('/webhooks/stripe/')) return true;
  if (p === '/webhooks/wise' || p.startsWith('/webhooks/wise/')) return true;
  return false;
}

module.exports = { getCapabilities, isPaymentSurfacePath };
