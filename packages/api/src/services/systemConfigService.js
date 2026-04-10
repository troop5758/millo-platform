'use strict';
/**
 * System Configuration Service — Admin-configurable service settings.
 * Allows managing Email, AI, Payments, CDN, and other service configurations
 * from the admin dashboard instead of just environment variables.
 *
 * Priority: Database settings > Environment variables > Defaults
 *
 * Sensitive values (API keys, secrets) are encrypted at rest.
 * https://milloapp.com
 */

const crypto = require('crypto');
const db = require('@millo/database');

// Encryption key for sensitive values (from env or generated)
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET?.slice(0, 32)?.padEnd(32, '0') || 'millo-default-config-key-32char';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Cache for configuration values
let _configCache = new Map();
let _cacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * All configurable service categories and their settings.
 * Each setting has: key, label, type, sensitive, default, description, envVar
 */
const CONFIG_SCHEMA = {
  email: {
    label: 'Email Service',
    description: 'Configure email delivery provider',
    settings: [
      {
        key: 'email.provider',
        label: 'Provider',
        type: 'select',
        options: ['sendgrid', 'aws_ses', 'resend', 'smtp', 'console'],
        default: 'console',
        envVar: 'EMAIL_PROVIDER',
        description:
          'Primary email transport. When saved here, overrides EMAIL_PROVIDER at runtime for API and workers (after sync). Use env for bootstrap-only or when DB is empty.',
      },
      { key: 'email.from', label: 'From Address', type: 'email', default: 'no-reply@milloapp.com', envVar: 'EMAIL_FROM' },
      { key: 'email.sendgrid_api_key', label: 'SendGrid API Key', type: 'string', sensitive: true, envVar: 'SENDGRID_API_KEY' },
      { key: 'email.resend_api_key', label: 'Resend API Key', type: 'string', sensitive: true, envVar: 'RESEND_API_KEY' },
      { key: 'email.smtp_host', label: 'SMTP Host', type: 'string', envVar: 'SMTP_HOST' },
      { key: 'email.smtp_port', label: 'SMTP Port', type: 'number', default: 587, envVar: 'SMTP_PORT' },
      { key: 'email.smtp_user', label: 'SMTP Username', type: 'string', envVar: 'SMTP_USER' },
      { key: 'email.smtp_pass', label: 'SMTP Password', type: 'string', sensitive: true, envVar: 'SMTP_PASS' },
      { key: 'email.smtp_secure', label: 'SMTP Secure (TLS)', type: 'boolean', default: false, envVar: 'SMTP_SECURE' },
      { key: 'email.console_disallowed', label: 'Block Console in Production', type: 'boolean', default: true, envVar: 'EMAIL_CONSOLE_DISALLOWED' },
    ],
  },

  ai: {
    label: 'AI Services',
    description: 'Configure AI providers for moderation, chat, and content analysis',
    settings: [
      { key: 'ai.openai_api_key', label: 'OpenAI API Key', type: 'string', sensitive: true, envVar: 'OPENAI_API_KEY' },
      { key: 'ai.openai_model', label: 'OpenAI Model', type: 'select', options: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'], default: 'gpt-4', envVar: 'OPENAI_MODEL' },
      { key: 'ai.anthropic_api_key', label: 'Anthropic API Key', type: 'string', sensitive: true, envVar: 'ANTHROPIC_API_KEY' },
      { key: 'ai.hive_api_key', label: 'Hive AI API Key', type: 'string', sensitive: true, envVar: 'HIVE_API_KEY' },
      { key: 'ai.moderation_enabled', label: 'AI Moderation Enabled', type: 'boolean', default: true, envVar: 'AI_MODERATION_ENABLED' },
      { key: 'ai.shadow_mode', label: 'AI Shadow Mode', type: 'boolean', default: true, description: 'AI suggestions only, no automatic actions' },
      { key: 'ai.content_scoring_enabled', label: 'Content Scoring', type: 'boolean', default: true },
    ],
  },

  payments: {
    label: 'Payment Providers',
    description: 'Configure Stripe, PayPal, and other payment gateways',
    settings: [
      { key: 'payments.stripe_secret_key', label: 'Stripe Secret Key', type: 'string', sensitive: true, envVar: 'STRIPE_SECRET_KEY' },
      { key: 'payments.stripe_publishable_key', label: 'Stripe Publishable Key', type: 'string', envVar: 'STRIPE_PUBLISHABLE_KEY' },
      { key: 'payments.stripe_webhook_secret', label: 'Stripe Webhook Secret', type: 'string', sensitive: true, envVar: 'STRIPE_WEBHOOK_SECRET' },
      { key: 'payments.paypal_client_id', label: 'PayPal Client ID', type: 'string', envVar: 'PAYPAL_CLIENT_ID' },
      { key: 'payments.paypal_client_secret', label: 'PayPal Client Secret', type: 'string', sensitive: true, envVar: 'PAYPAL_CLIENT_SECRET' },
      { key: 'payments.paypal_mode', label: 'PayPal Mode', type: 'select', options: ['sandbox', 'live'], default: 'sandbox', envVar: 'PAYPAL_MODE' },
      { key: 'payments.wise_api_key', label: 'Wise API Key', type: 'string', sensitive: true, envVar: 'WISE_API_KEY' },
      { key: 'payments.wise_profile_id', label: 'Wise Profile ID', type: 'string', envVar: 'WISE_PROFILE_ID' },
      { key: 'payments.wise_webhook_secret', label: 'Wise Webhook Secret', type: 'string', sensitive: true, envVar: 'WISE_WEBHOOK_SECRET' },
    ],
  },

  oauth: {
    label: 'OAuth Providers',
    description: 'Configure social login providers',
    settings: [
      { key: 'oauth.google_client_id', label: 'Google Client ID', type: 'string', envVar: 'OAUTH_GOOGLE_CLIENT_ID' },
      { key: 'oauth.google_client_secret', label: 'Google Client Secret', type: 'string', sensitive: true, envVar: 'OAUTH_GOOGLE_CLIENT_SECRET' },
      { key: 'oauth.facebook_client_id', label: 'Facebook App ID', type: 'string', envVar: 'OAUTH_FACEBOOK_CLIENT_ID' },
      { key: 'oauth.facebook_client_secret', label: 'Facebook App Secret', type: 'string', sensitive: true, envVar: 'OAUTH_FACEBOOK_CLIENT_SECRET' },
      { key: 'oauth.apple_client_id', label: 'Apple Client ID', type: 'string', envVar: 'OAUTH_APPLE_CLIENT_ID' },
      { key: 'oauth.apple_client_secret', label: 'Apple Client Secret', type: 'string', sensitive: true, envVar: 'OAUTH_APPLE_CLIENT_SECRET' },
      { key: 'oauth.github_client_id', label: 'GitHub Client ID', type: 'string', envVar: 'OAUTH_GITHUB_CLIENT_ID' },
      { key: 'oauth.github_client_secret', label: 'GitHub Client Secret', type: 'string', sensitive: true, envVar: 'OAUTH_GITHUB_CLIENT_SECRET' },
    ],
  },

  cloudflare: {
    label: 'Cloudflare',
    description: 'CDN, security, and media streaming',
    settings: [
      { key: 'cloudflare.api_token', label: 'API Token', type: 'string', sensitive: true, envVar: 'CLOUDFLARE_API_TOKEN' },
      { key: 'cloudflare.account_id', label: 'Account ID', type: 'string', envVar: 'CLOUDFLARE_ACCOUNT_ID' },
      { key: 'cloudflare.zone_id', label: 'Zone ID', type: 'string', envVar: 'CLOUDFLARE_ZONE_ID' },
      { key: 'cloudflare.r2_access_key', label: 'R2 Access Key', type: 'string', sensitive: true, envVar: 'CLOUDFLARE_R2_ACCESS_KEY' },
      { key: 'cloudflare.r2_secret_key', label: 'R2 Secret Key', type: 'string', sensitive: true, envVar: 'CLOUDFLARE_R2_SECRET_KEY' },
      { key: 'cloudflare.r2_bucket', label: 'R2 Bucket Name', type: 'string', envVar: 'CLOUDFLARE_R2_BUCKET' },
      { key: 'cloudflare.stream_api_token', label: 'Stream API Token', type: 'string', sensitive: true, envVar: 'CLOUDFLARE_STREAM_TOKEN' },
      { key: 'cloudflare.turnstile_site_key', label: 'Turnstile Site Key', type: 'string', envVar: 'TURNSTILE_SITE_KEY' },
      { key: 'cloudflare.turnstile_secret_key', label: 'Turnstile Secret Key', type: 'string', sensitive: true, envVar: 'TURNSTILE_SECRET_KEY' },
    ],
  },

  storage: {
    label: 'Storage',
    description: 'File and media storage configuration',
    settings: [
      { key: 'storage.provider', label: 'Storage Provider', type: 'select', options: ['local', 's3', 'r2', 'gcs', 'b2'], default: 'local', envVar: 'STORAGE_PROVIDER' },
      { key: 'storage.s3_bucket', label: 'S3 Bucket', type: 'string', envVar: 'AWS_S3_BUCKET' },
      { key: 'storage.s3_region', label: 'S3 Region', type: 'string', default: 'us-east-1', envVar: 'AWS_REGION' },
      { key: 'storage.s3_access_key', label: 'S3 Access Key', type: 'string', sensitive: true, envVar: 'AWS_ACCESS_KEY_ID' },
      { key: 'storage.s3_secret_key', label: 'S3 Secret Key', type: 'string', sensitive: true, envVar: 'AWS_SECRET_ACCESS_KEY' },
      { key: 'storage.cdn_url', label: 'CDN Base URL', type: 'url', envVar: 'CDN_URL' },
    ],
  },

  streaming: {
    label: 'Live Streaming',
    description: 'Configure live streaming infrastructure',
    settings: [
      { key: 'streaming.janus_url', label: 'Janus Gateway URL', type: 'url', envVar: 'JANUS_GATEWAY_URL' },
      { key: 'streaming.janus_admin_secret', label: 'Janus Admin Secret', type: 'string', sensitive: true, envVar: 'JANUS_ADMIN_SECRET' },
      { key: 'streaming.rtmp_url', label: 'RTMP Ingest URL', type: 'url', envVar: 'RTMP_URL' },
      { key: 'streaming.hls_url', label: 'HLS Playback URL', type: 'url', envVar: 'HLS_URL' },
      { key: 'streaming.max_bitrate', label: 'Max Bitrate (kbps)', type: 'number', default: 6000 },
      { key: 'streaming.max_concurrent', label: 'Max Concurrent Streams', type: 'number', default: 1000 },
    ],
  },

  database: {
    label: 'Database & Cache',
    description: 'Database and caching configuration',
    settings: [
      { key: 'database.mongodb_uri', label: 'MongoDB URI', type: 'string', sensitive: true, envVar: 'MONGODB_URI' },
      { key: 'database.redis_url', label: 'Redis URL', type: 'string', sensitive: true, envVar: 'REDIS_URL' },
      { key: 'database.neo4j_uri', label: 'Neo4j URI', type: 'string', envVar: 'NEO4J_URI' },
      { key: 'database.neo4j_user', label: 'Neo4j User', type: 'string', default: 'neo4j', envVar: 'NEO4J_USER' },
      { key: 'database.neo4j_password', label: 'Neo4j Password', type: 'string', sensitive: true, envVar: 'NEO4J_PASSWORD' },
    ],
  },

  eventbus: {
    label: 'Event Bus',
    description: 'Kafka or RabbitMQ configuration',
    settings: [
      { key: 'eventbus.provider', label: 'Provider', type: 'select', options: ['kafka', 'rabbitmq', 'none'], default: 'none' },
      { key: 'eventbus.kafka_enabled', label: 'Kafka Enabled', type: 'boolean', default: false, envVar: 'KAFKA_ENABLED' },
      { key: 'eventbus.kafka_brokers', label: 'Kafka Brokers', type: 'string', envVar: 'KAFKA_BROKERS' },
      { key: 'eventbus.rabbitmq_url', label: 'RabbitMQ URL', type: 'string', sensitive: true, envVar: 'RABBITMQ_URL' },
    ],
  },

  fraud: {
    label: 'Fraud Detection',
    description: 'Configure fraud prevention services',
    settings: [
      { key: 'fraud.sift_api_key', label: 'Sift API Key', type: 'string', sensitive: true, envVar: 'SIFT_API_KEY' },
      { key: 'fraud.riskified_account_id', label: 'Riskified Account ID', type: 'string', envVar: 'RISKIFIED_ACCOUNT_ID' },
      { key: 'fraud.riskified_auth_key', label: 'Riskified Auth Key', type: 'string', sensitive: true, envVar: 'RISKIFIED_AUTH_KEY' },
      { key: 'fraud.maxmind_license_key', label: 'MaxMind License Key', type: 'string', sensitive: true, envVar: 'MAXMIND_LICENSE_KEY' },
      { key: 'fraud.ip_risk_threshold', label: 'IP Risk Threshold', type: 'number', default: 70 },
    ],
  },

  kyc: {
    label: 'KYC / Identity Verification',
    description: 'Identity verification for creators (Sumsub, Onfido, Stripe Identity, Persona). Use "none" for stub mode.',
    settings: [
      { key: 'kyc.provider', label: 'Provider', type: 'select', options: ['none', 'sumsub', 'onfido', 'stripe_identity', 'persona'], default: 'none', envVar: 'KYC_PROVIDER', description: 'none = stub mode (verification disabled)' },
      { key: 'kyc.sumsub_app_token', label: 'Sumsub App Token', type: 'string', sensitive: true, envVar: 'SUMSUB_APP_TOKEN' },
      { key: 'kyc.sumsub_secret_key', label: 'Sumsub Secret Key', type: 'string', sensitive: true, envVar: 'SUMSUB_SECRET_KEY' },
      { key: 'kyc.sumsub_base_url', label: 'Sumsub Base URL', type: 'url', default: 'https://api.sumsub.com', envVar: 'SUMSUB_BASE_URL' },
      { key: 'kyc.sumsub_level_name', label: 'Sumsub Level Name', type: 'string', default: 'basic-kyc-level', envVar: 'SUMSUB_LEVEL_NAME' },
      { key: 'kyc.sumsub_webhook_secret', label: 'Sumsub Webhook Secret', type: 'string', sensitive: true, envVar: 'SUMSUB_WEBHOOK_SECRET' },
      { key: 'kyc.onfido_api_token', label: 'Onfido API Token', type: 'string', sensitive: true, envVar: 'ONFIDO_API_TOKEN' },
      { key: 'kyc.onfido_region', label: 'Onfido Region', type: 'select', options: ['eu', 'us'], default: 'eu', envVar: 'ONFIDO_REGION' },
      { key: 'kyc.persona_api_key', label: 'Persona API Key', type: 'string', sensitive: true, envVar: 'PERSONA_API_KEY' },
      { key: 'kyc.persona_template_id', label: 'Persona Template ID', type: 'string', envVar: 'PERSONA_TEMPLATE_ID' },
      { key: 'kyc.persona_webhook_secret', label: 'Persona Webhook Secret', type: 'string', sensitive: true, envVar: 'PERSONA_WEBHOOK_SECRET' },
      { key: 'kyc.stub_allows_payout', label: 'Stub Mode: Allow Payout Without KYC', type: 'boolean', default: false, description: 'When KYC is disabled, allow creators to receive payouts (dev only)' },
    ],
  },

  monitoring: {
    label: 'Monitoring & Logging',
    description: 'Configure observability tools',
    settings: [
      { key: 'monitoring.sentry_dsn', label: 'Sentry DSN', type: 'string', envVar: 'SENTRY_DSN' },
      { key: 'monitoring.prometheus_enabled', label: 'Prometheus Metrics', type: 'boolean', default: true },
      { key: 'monitoring.log_level', label: 'Log Level', type: 'select', options: ['debug', 'info', 'warn', 'error'], default: 'info', envVar: 'LOG_LEVEL' },
    ],
  },

  platform: {
    label: 'Platform Settings',
    description: 'General platform configuration',
    settings: [
      { key: 'platform.app_name', label: 'App Name', type: 'string', default: 'Millo' },
      { key: 'platform.app_url', label: 'App URL', type: 'url', envVar: 'APP_URL' },
      { key: 'platform.frontend_url', label: 'Frontend URL', type: 'url', envVar: 'FRONTEND_URL' },
      { key: 'platform.support_email', label: 'Support Email', type: 'email', default: 'support@milloapp.com' },
      { key: 'platform.maintenance_mode', label: 'Maintenance Mode', type: 'boolean', default: false },
      { key: 'platform.registration_enabled', label: 'Registration Enabled', type: 'boolean', default: true },
      { key: 'platform.invite_only', label: 'Invite Only', type: 'boolean', default: false },
      { key: 'creator_monthly_cents', label: 'Creator Monthly (cents)', type: 'number', default: 499, description: 'e.g. 499 = $4.99/month' },
      { key: 'creator_lifetime_cents', label: 'Creator Lifetime (cents)', type: 'number', default: 6900, description: 'e.g. 6900 = $69 one-time' },
      { key: 'creator_lifetime_launch_cents', label: 'Creator Lifetime Launch (cents)', type: 'number', default: 4900, description: 'e.g. 4900 = $49 for first N creators' },
      { key: 'creator_lifetime_launch_cap', label: 'Creator Lifetime Launch Cap', type: 'number', default: 10000, description: 'First N creators get launch price' },
      { key: 'free_creator_max_daily_gift_cents', label: 'Free Creator Max Daily Gift (cents)', type: 'number', default: 5000, description: 'Max gift value per day for free creators ($50 = 5000)' },
      { key: 'max_gifts_per_minute', label: 'Max Gifts Per Minute (sender)', type: 'number', default: 10, description: 'Anti-fraud: max gift transactions per sender per minute' },
      { key: 'max_gift_value_per_hour_cents', label: 'Max Gift Value Per Hour (cents)', type: 'number', default: 10000, description: 'Anti-fraud: max total gift value per sender per hour ($100 = 10000)' },
      { key: 'trusted_creator_min_followers', label: 'Trusted Creator Min Followers', type: 'number', default: 5000, description: 'Min followers required for trusted creator tier' },
      { key: 'trusted_creator_min_reputation_score', label: 'Trusted Creator Min Reputation Score', type: 'number', default: 70, description: 'Min CRS (0-100) for trusted creator; good_standing = 70+' },
    ],
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
 *  ENCRYPTION HELPERS
 * ══════════════════════════════════════════════════════════════════════════════ */

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !authTagHex || !encrypted) return null;
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  CONFIGURATION ACCESS
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Get a configuration value.
 * Priority: Database > Environment Variable > Default
 */
async function get(key, defaultValue = null) {
  // Check cache first
  const now = Date.now();
  if (_configCache.has(key) && now - _cacheTime < CACHE_TTL_MS) {
    return _configCache.get(key);
  }

  // Find setting definition
  const settingDef = findSettingDefinition(key);

  // Try database first
  try {
    const doc = await db.PlatformSetting.findOne({ key }).lean();
    if (doc && doc.value !== undefined && doc.value !== null && doc.value !== '') {
      let value = doc.value;
      // Decrypt if sensitive
      if (settingDef?.sensitive && typeof value === 'string' && value.includes(':')) {
        value = decrypt(value) || value;
      }
      _configCache.set(key, value);
      _cacheTime = now;
      return value;
    }
  } catch {
    // Database not available, continue to env var
  }

  // Try environment variable
  if (settingDef?.envVar) {
    const envValue = process.env[settingDef.envVar];
    if (envValue !== undefined && envValue !== '') {
      const typed = parseValue(envValue, settingDef.type);
      _configCache.set(key, typed);
      return typed;
    }
  }

  // Return default
  const def = settingDef?.default ?? defaultValue;
  _configCache.set(key, def);
  return def;
}

/**
 * Set a configuration value in the database.
 */
async function set(key, value, adminId = null) {
  const settingDef = findSettingDefinition(key);
  if (!settingDef) {
    throw new Error(`Unknown configuration key: ${key}`);
  }

  // Validate value type
  const validated = validateValue(value, settingDef);

  // Encrypt sensitive values
  let storedValue = validated;
  if (settingDef.sensitive && validated) {
    storedValue = encrypt(String(validated));
  }

  // Upsert in database
  await db.PlatformSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value: storedValue,
        updatedBy: adminId ? String(adminId) : null,
      },
    },
    { upsert: true }
  );

  // Clear cache
  _configCache.delete(key);

  // Audit log
  await db.AdminAuditLog?.create({
    action: 'config_update',
    adminId,
    targetType: 'PlatformSetting',
    targetId: key,
    meta: {
      key,
      sensitive: settingDef.sensitive,
      // Don't log sensitive values
      newValue: settingDef.sensitive ? '[REDACTED]' : validated,
    },
  }).catch(() => {});

  return { key, updated: true };
}

/**
 * Delete a configuration value (revert to env/default).
 */
async function remove(key, adminId = null) {
  await db.PlatformSetting.deleteOne({ key });
  _configCache.delete(key);

  await db.AdminAuditLog?.create({
    action: 'config_delete',
    adminId,
    targetType: 'PlatformSetting',
    targetId: key,
  }).catch(() => {});

  return { key, deleted: true };
}

/**
 * Get all settings for a category.
 */
async function getCategory(categoryId) {
  const category = CONFIG_SCHEMA[categoryId];
  if (!category) return null;

  const settings = [];
  for (const setting of category.settings) {
    const value = await get(setting.key);
    settings.push({
      ...setting,
      value: setting.sensitive ? (value ? '••••••••' : null) : value,
      hasValue: value !== null && value !== undefined && value !== '',
      source: await getValueSource(setting.key),
    });
  }

  return {
    id: categoryId,
    label: category.label,
    description: category.description,
    settings,
  };
}

/**
 * Get all categories with their settings.
 */
async function getAllCategories() {
  const categories = [];
  for (const categoryId of Object.keys(CONFIG_SCHEMA)) {
    const category = await getCategory(categoryId);
    if (category) categories.push(category);
  }
  return categories;
}

/**
 * Bulk update multiple settings.
 */
async function bulkUpdate(updates, adminId = null) {
  const results = [];
  for (const { key, value } of updates) {
    try {
      await set(key, value, adminId);
      results.push({ key, success: true });
    } catch (err) {
      results.push({ key, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Get the source of a value (database, env, or default).
 */
async function getValueSource(key) {
  try {
    const doc = await db.PlatformSetting.findOne({ key }).lean();
    if (doc && doc.value !== undefined && doc.value !== null && doc.value !== '') {
      return 'database';
    }
  } catch {
    // Database not available
  }

  const settingDef = findSettingDefinition(key);
  if (settingDef?.envVar && process.env[settingDef.envVar]) {
    return 'environment';
  }

  return 'default';
}

/**
 * Test a configuration (e.g., test email sending, test Stripe connection).
 */
async function testConfiguration(categoryId) {
  const tests = {
    email: async () => {
      const { syncEmailConfigToProcessEnv, reloadEmailTransporter } = require('./emailRuntimeSync');
      await syncEmailConfigToProcessEnv(console);
      reloadEmailTransporter();
      const notifications = require('@millo/notifications');
      return notifications.emailHealthCheck();
    },
    payments: async () => {
      const stripeKey = await get('payments.stripe_secret_key');
      if (!stripeKey) return { healthy: false, error: 'Stripe not configured' };
      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(stripeKey);
        await stripe.accounts.retrieve();
        return { healthy: true, provider: 'stripe' };
      } catch (err) {
        return { healthy: false, error: err.message };
      }
    },
    database: async () => {
      try {
        await db.PlatformSetting.findOne({}).lean();
        return { healthy: true, provider: 'mongodb' };
      } catch (err) {
        return { healthy: false, error: err.message };
      }
    },
    // Add more test functions as needed
  };

  const testFn = tests[categoryId];
  if (!testFn) return { tested: false, message: 'No test available for this category' };

  try {
    return await testFn();
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

/**
 * Export configuration for backup (sensitive values encrypted).
 */
async function exportConfig() {
  const docs = await db.PlatformSetting.find({}).lean();
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    settings: docs.map((d) => ({
      key: d.key,
      value: d.value, // Already encrypted if sensitive
      updatedAt: d.updatedAt,
    })),
  };
}

/**
 * Import configuration from backup.
 */
async function importConfig(backup, adminId = null) {
  if (!backup?.settings || !Array.isArray(backup.settings)) {
    throw new Error('Invalid backup format');
  }

  const results = [];
  for (const setting of backup.settings) {
    try {
      await db.PlatformSetting.findOneAndUpdate(
        { key: setting.key },
        { $set: { value: setting.value, updatedBy: adminId } },
        { upsert: true }
      );
      results.push({ key: setting.key, imported: true });
    } catch (err) {
      results.push({ key: setting.key, imported: false, error: err.message });
    }
  }

  // Clear all cache
  _configCache.clear();

  return { imported: results.filter((r) => r.imported).length, total: results.length, results };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════════════════════ */

function findSettingDefinition(key) {
  for (const category of Object.values(CONFIG_SCHEMA)) {
    const setting = category.settings.find((s) => s.key === key);
    if (setting) return setting;
  }
  return null;
}

function parseValue(value, type) {
  switch (type) {
    case 'boolean':
      return value === 'true' || value === true;
    case 'number':
      return Number(value);
    default:
      return value;
  }
}

function validateValue(value, settingDef) {
  const { type, options } = settingDef;

  if (type === 'select' && options && !options.includes(value)) {
    throw new Error(`Invalid value. Must be one of: ${options.join(', ')}`);
  }

  if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Invalid email address');
  }

  if (type === 'url' && value && !/^https?:\/\/.+/.test(value)) {
    throw new Error('Invalid URL');
  }

  if (type === 'number' && value !== null && value !== undefined) {
    const num = Number(value);
    if (isNaN(num)) throw new Error('Invalid number');
    return num;
  }

  if (type === 'boolean') {
    return value === true || value === 'true';
  }

  return value;
}

/**
 * Clear configuration cache.
 */
function clearCache() {
  _configCache.clear();
  _cacheTime = 0;
}

/**
 * Get schema for frontend form generation.
 */
function getSchema() {
  return CONFIG_SCHEMA;
}

module.exports = {
  // Schema
  CONFIG_SCHEMA,
  getSchema,

  // CRUD
  get,
  set,
  remove,
  bulkUpdate,

  // Categories
  getCategory,
  getAllCategories,

  // Testing
  testConfiguration,

  // Import/Export
  exportConfig,
  importConfig,

  // Utilities
  getValueSource,
  clearCache,
  findSettingDefinition,
};
