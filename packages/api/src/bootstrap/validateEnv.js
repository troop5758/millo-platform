'use strict';
/**
 * Production Environment Validator — prevents dev stubs from running in production.
 * Called at server startup BEFORE any routes or database connections.
 * https://milloapp.com
 */

/**
 * Critical environment variables required for production.
 * Missing any of these will cause the server to exit immediately.
 */
const CRITICAL_ENV = [
  // Authentication
  'JWT_SECRET',

  // Database
  'MONGODB_URI',
  'REDIS_URL',

  // Payments (at least Stripe required)
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
];

/**
 * Important environment variables that should be configured for full functionality.
 * Server will start with warnings if these are missing.
 */
const IMPORTANT_ENV = [
  // OAuth (at least one required by productionGuard)
  'OAUTH_GOOGLE_CLIENT_ID',
  'OAUTH_GOOGLE_CLIENT_SECRET',

  // Object storage (uploads, VOD, moderation artifacts)
  'AWS_S3_BUCKET',

  // Event Bus (for async processing)
  'KAFKA_BROKERS',

  // Live Streaming (for co-hosting)
  'JANUS_GATEWAY_URL',

  // KYC (for creator verification)
  'KYC_PROVIDER',

  // AI Moderation (at least one provider)
  'OPENAI_API_KEY',

  // Copyright scanning
  'AUDD_API_TOKEN',

  // CAPTCHA
  'CAPTCHA_PROVIDER',
];

/**
 * Email provider-specific required variables.
 */
const EMAIL_PROVIDER_VARS = {
  sendgrid: ['SENDGRID_API_KEY'],
  aws_ses: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  ses: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  resend: ['RESEND_API_KEY'],
  smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
};

/**
 * KYC provider-specific required variables.
 */
const KYC_PROVIDER_VARS = {
  onfido: ['ONFIDO_API_TOKEN'],
  sumsub: ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  persona: ['PERSONA_API_KEY', 'PERSONA_TEMPLATE_ID'],
};

/**
 * Validate that all required environment variables are present.
 * In production, missing critical variables cause immediate exit.
 * In development, only logs warnings.
 *
 * @returns {{ missing: string[], warnings: string[] }}
 */
function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = [];
  const warnings = [];

  // Check critical environment variables
  for (const key of CRITICAL_ENV) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(key);
    }
  }

  // Redis: accept REDIS_URI or REDIS_HOST+REDIS_PORT as well as REDIS_URL
  const redisIdx = missing.indexOf('REDIS_URL');
  if (redisIdx !== -1) {
    const redisOk =
      (process.env.REDIS_URI && process.env.REDIS_URI.trim() !== '') ||
      (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') ||
      (process.env.REDIS_HOST && String(process.env.REDIS_PORT || '').trim() !== '');
    if (redisOk) missing.splice(redisIdx, 1);
  }

  if (isProduction) {
    if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.trim() === '') {
      if (!missing.includes('STRIPE_WEBHOOK_SECRET')) missing.push('STRIPE_WEBHOOK_SECRET');
    }
    // Email provider: enforced after Mongo load via emailRuntimeSync + validateEmailConfig
    // (Admin → System Config can set email.provider without EMAIL_PROVIDER in .env).
  }

  // Turnstile: when CAPTCHA_PROVIDER=turnstile, secrets must be present for enterprise login RBA.
  const captchaNorm = (process.env.CAPTCHA_PROVIDER || '').toLowerCase().trim();
  if (captchaNorm === 'turnstile') {
    const turnstileSecret =
      (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY && process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY.trim()) ||
      (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SECRET.trim());
    const turnstileSite =
      process.env.CLOUDFLARE_TURNSTILE_SITE_KEY && process.env.CLOUDFLARE_TURNSTILE_SITE_KEY.trim();
    if (!turnstileSecret) {
      missing.push('CLOUDFLARE_TURNSTILE_SECRET_KEY');
    }
    if (!turnstileSite) {
      missing.push('CLOUDFLARE_TURNSTILE_SITE_KEY');
    }
  }

  // Check email provider-specific variables
  const emailProvider = (process.env.EMAIL_PROVIDER || '').toLowerCase().replace(/-/g, '_');
  if (emailProvider && EMAIL_PROVIDER_VARS[emailProvider]) {
    for (const key of EMAIL_PROVIDER_VARS[emailProvider]) {
      if (!process.env[key] || process.env[key].trim() === '') {
        missing.push(key);
      }
    }
  }

  // Check important environment variables (warnings only)
  for (const key of IMPORTANT_ENV) {
    if (!process.env[key] || process.env[key].trim() === '') {
      warnings.push(key);
    }
  }

  // Check KYC provider-specific variables if provider is set
  const kycProvider = (process.env.KYC_PROVIDER || '').toLowerCase();
  if (kycProvider && KYC_PROVIDER_VARS[kycProvider]) {
    for (const key of KYC_PROVIDER_VARS[kycProvider]) {
      if (!process.env[key] || process.env[key].trim() === '') {
        warnings.push(key);
      }
    }
  }

  // Enterprise: optional stricter public URL and CORS alignment (https://milloapp.com).
  if (isProduction && process.env.ENTERPRISE_BOOT_STRICT === 'true') {
    const appUrl = (process.env.APP_URL || '').trim();
    if (appUrl && !/^https:\/\//i.test(appUrl)) {
      console.error('\n[ENTERPRISE_BOOT_STRICT] APP_URL must use https:// in production.\n');
      process.exit(1);
    }
    const cors = (process.env.CORS_ORIGIN || '').trim();
    if (cors && cors !== 'true' && !cors.includes('milloapp.com')) {
      console.warn(
        '[ENTERPRISE_BOOT_STRICT] CORS_ORIGIN should include https://milloapp.com (or your approved SPA host).'
      );
    }
  }

  // Production: fail hard on missing critical vars
  if (isProduction && missing.length > 0) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║           PRODUCTION BOOT VALIDATION FAILED                    ║');
    console.error('╠════════════════════════════════════════════════════════════════╣');
    console.error('║ The following required environment variables are missing:      ║');
    console.error('╠════════════════════════════════════════════════════════════════╣');
    for (const key of missing) {
      console.error(`║   • ${key.padEnd(56)}║`);
    }
    console.error('╠════════════════════════════════════════════════════════════════╣');
    console.error('║ Dev stubs are NOT ALLOWED in production.                       ║');
    console.error('║ Configure all required environment variables before deploying. ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }

  // Production: warn on missing important vars
  if (isProduction && warnings.length > 0) {
    console.warn('\n┌────────────────────────────────────────────────────────────────┐');
    console.warn('│           PRODUCTION WARNING: Optional vars missing            │');
    console.warn('├────────────────────────────────────────────────────────────────┤');
    for (const key of warnings) {
      console.warn(`│   • ${key.padEnd(56)}│`);
    }
    console.warn('├────────────────────────────────────────────────────────────────┤');
    console.warn('│ Some features may be degraded without these variables.         │');
    console.warn('└────────────────────────────────────────────────────────────────┘\n');
  }

  // Development: just log what's missing
  if (!isProduction && (missing.length > 0 || warnings.length > 0)) {
    console.log('\n[DEV] Environment check:');
    if (missing.length > 0) {
      console.log(`  Missing (would fail in production): ${missing.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.log(`  Missing (would warn in production): ${warnings.join(', ')}`);
    }
    console.log('  Running in development mode — stubs may be active.\n');
  }

  return { missing, warnings };
}

/**
 * List of all environment variables checked.
 */
function getRequiredEnvList() {
  return {
    critical: CRITICAL_ENV,
    important: IMPORTANT_ENV,
    emailProviders: EMAIL_PROVIDER_VARS,
    kycProviders: KYC_PROVIDER_VARS,
  };
}

module.exports = { validateEnv, getRequiredEnvList };
