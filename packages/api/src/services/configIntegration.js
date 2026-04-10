'use strict';
/**
 * Configuration Integration — Allows services to optionally use admin-configured settings.
 * Falls back to environment variables when database config is not available.
 * https://milloapp.com
 */

let _systemConfig = null;
let _configAvailable = null;

/**
 * Lazy load systemConfigService to avoid circular dependencies.
 */
function getSystemConfig() {
  if (_systemConfig) return _systemConfig;
  try {
    _systemConfig = require('./systemConfigService');
    return _systemConfig;
  } catch {
    return null;
  }
}

/**
 * Check if database configuration is available.
 */
async function isConfigAvailable() {
  if (_configAvailable !== null) return _configAvailable;
  
  try {
    const config = getSystemConfig();
    if (!config) {
      _configAvailable = false;
      return false;
    }
    // Try a simple read to check DB connectivity
    await config.get('platform.app_name');
    _configAvailable = true;
    return true;
  } catch {
    _configAvailable = false;
    return false;
  }
}

/**
 * Get a configuration value with fallback to environment variable.
 * @param {string} key - Configuration key (e.g., 'email.provider')
 * @param {string} envVar - Environment variable name
 * @param {any} defaultValue - Default value if neither is set
 */
async function getConfig(key, envVar, defaultValue = null) {
  // Try database first
  if (await isConfigAvailable()) {
    const config = getSystemConfig();
    try {
      const value = await config.get(key);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    } catch {
      // Fall through to env var
    }
  }

  // Fall back to environment variable
  if (envVar && process.env[envVar] !== undefined && process.env[envVar] !== '') {
    const envValue = process.env[envVar];
    // Parse boolean and number types
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    const num = Number(envValue);
    if (!isNaN(num) && envValue.trim() !== '') return num;
    return envValue;
  }

  return defaultValue;
}

/**
 * Get multiple configuration values at once.
 */
async function getConfigs(mappings) {
  const result = {};
  for (const [resultKey, { configKey, envVar, defaultValue }] of Object.entries(mappings)) {
    result[resultKey] = await getConfig(configKey, envVar, defaultValue);
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  EMAIL CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getEmailConfig() {
  return getConfigs({
    provider: { configKey: 'email.provider', envVar: 'EMAIL_PROVIDER', defaultValue: 'console' },
    from: { configKey: 'email.from', envVar: 'EMAIL_FROM', defaultValue: 'no-reply@milloapp.com' },
    sendgridApiKey: { configKey: 'email.sendgrid_api_key', envVar: 'SENDGRID_API_KEY' },
    resendApiKey: { configKey: 'email.resend_api_key', envVar: 'RESEND_API_KEY' },
    smtpHost: { configKey: 'email.smtp_host', envVar: 'SMTP_HOST' },
    smtpPort: { configKey: 'email.smtp_port', envVar: 'SMTP_PORT', defaultValue: 587 },
    smtpUser: { configKey: 'email.smtp_user', envVar: 'SMTP_USER' },
    smtpPass: { configKey: 'email.smtp_pass', envVar: 'SMTP_PASS' },
    smtpSecure: { configKey: 'email.smtp_secure', envVar: 'SMTP_SECURE', defaultValue: false },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  AI CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getAIConfig() {
  return getConfigs({
    openaiApiKey: { configKey: 'ai.openai_api_key', envVar: 'OPENAI_API_KEY' },
    openaiModel: { configKey: 'ai.openai_model', envVar: 'OPENAI_MODEL', defaultValue: 'gpt-4' },
    anthropicApiKey: { configKey: 'ai.anthropic_api_key', envVar: 'ANTHROPIC_API_KEY' },
    hiveApiKey: { configKey: 'ai.hive_api_key', envVar: 'HIVE_API_KEY' },
    moderationEnabled: { configKey: 'ai.moderation_enabled', envVar: 'AI_MODERATION_ENABLED', defaultValue: true },
    shadowMode: { configKey: 'ai.shadow_mode', envVar: null, defaultValue: true },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  PAYMENT CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getStripeConfig() {
  return getConfigs({
    secretKey: { configKey: 'payments.stripe_secret_key', envVar: 'STRIPE_SECRET_KEY' },
    publishableKey: { configKey: 'payments.stripe_publishable_key', envVar: 'STRIPE_PUBLISHABLE_KEY' },
    webhookSecret: { configKey: 'payments.stripe_webhook_secret', envVar: 'STRIPE_WEBHOOK_SECRET' },
  });
}

async function getPayPalConfig() {
  return getConfigs({
    clientId: { configKey: 'payments.paypal_client_id', envVar: 'PAYPAL_CLIENT_ID' },
    clientSecret: { configKey: 'payments.paypal_client_secret', envVar: 'PAYPAL_CLIENT_SECRET' },
    mode: { configKey: 'payments.paypal_mode', envVar: 'PAYPAL_MODE', defaultValue: 'sandbox' },
  });
}

async function getWiseConfig() {
  return getConfigs({
    apiKey: { configKey: 'payments.wise_api_key', envVar: 'WISE_API_KEY' },
    profileId: { configKey: 'payments.wise_profile_id', envVar: 'WISE_PROFILE_ID' },
    webhookSecret: { configKey: 'payments.wise_webhook_secret', envVar: 'WISE_WEBHOOK_SECRET' },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  OAUTH CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getOAuthConfig() {
  return {
    google: await getConfigs({
      clientId: { configKey: 'oauth.google_client_id', envVar: 'OAUTH_GOOGLE_CLIENT_ID' },
      clientSecret: { configKey: 'oauth.google_client_secret', envVar: 'OAUTH_GOOGLE_CLIENT_SECRET' },
    }),
    facebook: await getConfigs({
      clientId: { configKey: 'oauth.facebook_client_id', envVar: 'OAUTH_FACEBOOK_CLIENT_ID' },
      clientSecret: { configKey: 'oauth.facebook_client_secret', envVar: 'OAUTH_FACEBOOK_CLIENT_SECRET' },
    }),
    apple: await getConfigs({
      clientId: { configKey: 'oauth.apple_client_id', envVar: 'OAUTH_APPLE_CLIENT_ID' },
      clientSecret: { configKey: 'oauth.apple_client_secret', envVar: 'OAUTH_APPLE_CLIENT_SECRET' },
    }),
    github: await getConfigs({
      clientId: { configKey: 'oauth.github_client_id', envVar: 'OAUTH_GITHUB_CLIENT_ID' },
      clientSecret: { configKey: 'oauth.github_client_secret', envVar: 'OAUTH_GITHUB_CLIENT_SECRET' },
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  CLOUDFLARE CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getCloudflareConfig() {
  return getConfigs({
    apiToken: { configKey: 'cloudflare.api_token', envVar: 'CLOUDFLARE_API_TOKEN' },
    accountId: { configKey: 'cloudflare.account_id', envVar: 'CLOUDFLARE_ACCOUNT_ID' },
    zoneId: { configKey: 'cloudflare.zone_id', envVar: 'CLOUDFLARE_ZONE_ID' },
    r2AccessKey: { configKey: 'cloudflare.r2_access_key', envVar: 'CLOUDFLARE_R2_ACCESS_KEY' },
    r2SecretKey: { configKey: 'cloudflare.r2_secret_key', envVar: 'CLOUDFLARE_R2_SECRET_KEY' },
    r2Bucket: { configKey: 'cloudflare.r2_bucket', envVar: 'CLOUDFLARE_R2_BUCKET' },
    turnstileSiteKey: { configKey: 'cloudflare.turnstile_site_key', envVar: 'TURNSTILE_SITE_KEY' },
    turnstileSecretKey: { configKey: 'cloudflare.turnstile_secret_key', envVar: 'TURNSTILE_SECRET_KEY' },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  STORAGE CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getStorageConfig() {
  return getConfigs({
    provider: { configKey: 'storage.provider', envVar: 'STORAGE_PROVIDER', defaultValue: 'local' },
    s3Bucket: { configKey: 'storage.s3_bucket', envVar: 'AWS_S3_BUCKET' },
    s3Region: { configKey: 'storage.s3_region', envVar: 'AWS_REGION', defaultValue: 'us-east-1' },
    s3AccessKey: { configKey: 'storage.s3_access_key', envVar: 'AWS_ACCESS_KEY_ID' },
    s3SecretKey: { configKey: 'storage.s3_secret_key', envVar: 'AWS_SECRET_ACCESS_KEY' },
    cdnUrl: { configKey: 'storage.cdn_url', envVar: 'CDN_URL' },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  STREAMING CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getStreamingConfig() {
  return getConfigs({
    janusUrl: { configKey: 'streaming.janus_url', envVar: 'JANUS_GATEWAY_URL' },
    janusAdminSecret: { configKey: 'streaming.janus_admin_secret', envVar: 'JANUS_ADMIN_SECRET' },
    rtmpUrl: { configKey: 'streaming.rtmp_url', envVar: 'RTMP_URL' },
    hlsUrl: { configKey: 'streaming.hls_url', envVar: 'HLS_URL' },
    maxBitrate: { configKey: 'streaming.max_bitrate', envVar: null, defaultValue: 6000 },
    maxConcurrent: { configKey: 'streaming.max_concurrent', envVar: null, defaultValue: 1000 },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  PLATFORM CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getPlatformConfig() {
  return getConfigs({
    appName: { configKey: 'platform.app_name', envVar: null, defaultValue: 'Millo' },
    appUrl: { configKey: 'platform.app_url', envVar: 'APP_URL', defaultValue: 'https://milloapp.com' },
    frontendUrl: { configKey: 'platform.frontend_url', envVar: 'FRONTEND_URL', defaultValue: 'https://milloapp.com' },
    supportEmail: { configKey: 'platform.support_email', envVar: null, defaultValue: 'support@milloapp.com' },
    maintenanceMode: { configKey: 'platform.maintenance_mode', envVar: null, defaultValue: false },
    registrationEnabled: { configKey: 'platform.registration_enabled', envVar: null, defaultValue: true },
    inviteOnly: { configKey: 'platform.invite_only', envVar: null, defaultValue: false },
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  KYC CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════════ */

async function getKycConfig() {
  return getConfigs({
    provider: { configKey: 'kyc.provider', envVar: 'KYC_PROVIDER', defaultValue: 'none' },
    sumsubAppToken: { configKey: 'kyc.sumsub_app_token', envVar: 'SUMSUB_APP_TOKEN' },
    sumsubSecretKey: { configKey: 'kyc.sumsub_secret_key', envVar: 'SUMSUB_SECRET_KEY' },
    sumsubBaseUrl: { configKey: 'kyc.sumsub_base_url', envVar: 'SUMSUB_BASE_URL', defaultValue: 'https://api.sumsub.com' },
    sumsubLevelName: { configKey: 'kyc.sumsub_level_name', envVar: 'SUMSUB_LEVEL_NAME', defaultValue: 'basic-kyc-level' },
    sumsubWebhookSecret: { configKey: 'kyc.sumsub_webhook_secret', envVar: 'SUMSUB_WEBHOOK_SECRET' },
    onfidoApiToken: { configKey: 'kyc.onfido_api_token', envVar: 'ONFIDO_API_TOKEN' },
    onfidoRegion: { configKey: 'kyc.onfido_region', envVar: 'ONFIDO_REGION', defaultValue: 'eu' },
    personaApiKey: { configKey: 'kyc.persona_api_key', envVar: 'PERSONA_API_KEY' },
    personaTemplateId: { configKey: 'kyc.persona_template_id', envVar: 'PERSONA_TEMPLATE_ID' },
    personaWebhookSecret: { configKey: 'kyc.persona_webhook_secret', envVar: 'PERSONA_WEBHOOK_SECRET' },
    stubAllowsPayout: { configKey: 'kyc.stub_allows_payout', envVar: null, defaultValue: false },
  });
}

/**
 * Reset cache (for testing).
 */
function reset() {
  _systemConfig = null;
  _configAvailable = null;
}

module.exports = {
  // Core
  getConfig,
  getConfigs,
  isConfigAvailable,
  reset,

  // Service-specific configs
  getEmailConfig,
  getAIConfig,
  getStripeConfig,
  getPayPalConfig,
  getWiseConfig,
  getOAuthConfig,
  getCloudflareConfig,
  getStorageConfig,
  getStreamingConfig,
  getPlatformConfig,
  getKycConfig,
};
