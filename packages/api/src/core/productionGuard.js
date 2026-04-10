'use strict';
/**
 * productionGuard — hard-stop dev/sandbox providers in production.
 * Called once at startup (after validateEnv, before routes).
 * Validates that services are properly configured, not just that env vars exist.
 * https://milloapp.com
 */

const assert = require('node:assert');
const { getProvider: getPaymentProvider } = require('../services/payments');
const { getAuthProviders } = require('../services/authProviderRegistry');

function runProductionGuard() {
  if (process.env.NODE_ENV !== 'production') return;

  console.log('[PRODUCTION GUARD] Running production safety checks...');

  assert.ok(
    (process.env.STRIPE_SECRET_KEY || '').trim().length > 0,
    'STRIPE_SECRET_KEY is required in production'
  );
  assert.ok(
    (process.env.STRIPE_WEBHOOK_SECRET || '').trim().length > 0,
    'STRIPE_WEBHOOK_SECRET is required in production'
  );

  // 1. Payments: sandbox / stub providers must not be active in production.
  const paymentProvider = process.env.PAYMENT_PROVIDER || 'stripe';
  if (paymentProvider === 'sandbox' || paymentProvider === 'dev') {
    throw new Error('Sandbox payments not allowed in production. Set PAYMENT_PROVIDER to a real provider (e.g. stripe).');
  }
  if (paymentProvider === 'coin') {
    throw new Error('Coin provider cannot be primary PAYMENT_PROVIDER in production.');
  }
  const providerImpl = getPaymentProvider(paymentProvider);
  if (!providerImpl || typeof providerImpl.createPayment !== 'function') {
    throw new Error(`Payment provider '${paymentProvider}' is not properly configured in production.`);
  }
  console.log(`[PRODUCTION GUARD] ✓ Payment provider '${paymentProvider}' verified`);

  // 2. Email: console-only transport must not be used in production.
  try {
    const notif = require('@millo/notifications');
    const consoleOnly = typeof notif.isConsoleTransport === 'function' ? notif.isConsoleTransport() : false;
    const disallowConsole = process.env.EMAIL_CONSOLE_DISALLOWED === 'true';
    if (disallowConsole && consoleOnly) {
      throw new Error('Console email disabled in production. Configure a real email provider.');
    }
    if (consoleOnly) {
      console.warn('[PRODUCTION GUARD] ⚠ Email using console transport (set EMAIL_CONSOLE_DISALLOWED=true to enforce real provider)');
    } else {
      console.log(`[PRODUCTION GUARD] ✓ Email provider '${process.env.EMAIL_PROVIDER || 'default'}' verified`);
    }
  } catch (e) {
    throw new Error(e.message || 'Notifications module not available in production.');
  }

  // 3. OAuth: at least one OAuth provider should be configured in production.
  const authProviders = getAuthProviders();
  const oauthEnabled = authProviders.some((p) => p.type === 'oauth' && p.enabled);
  if (!oauthEnabled) {
    throw new Error('OAuth must be configured in production (Google/Apple/Facebook).');
  }
  const enabledOAuth = authProviders.filter((p) => p.type === 'oauth' && p.enabled).map((p) => p.name);
  console.log(`[PRODUCTION GUARD] ✓ OAuth providers: ${enabledOAuth.join(', ')}`);

  // 4. Verify JWT secret is strong enough (at least 32 characters).
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  console.log('[PRODUCTION GUARD] ✓ JWT secret verified (length OK)');

  console.log('[PRODUCTION GUARD] ✓ Stripe secret + webhook secret asserted');

  // 6. Check for common misconfigurations.
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    console.warn('[PRODUCTION GUARD] ⚠ Rate limiting is DISABLED — this is dangerous in production');
  }
  if (process.env.SKIP_AUTH === 'true') {
    throw new Error('SKIP_AUTH=true is not allowed in production.');
  }
  if (process.env.DEV_MODE === 'true' || process.env.DEVELOPMENT === 'true') {
    throw new Error('DEV_MODE/DEVELOPMENT flags are not allowed in production.');
  }

  console.log('[PRODUCTION GUARD] ✓ All production checks passed\n');
}

module.exports = { runProductionGuard };

