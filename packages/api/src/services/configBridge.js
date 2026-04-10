'use strict';
/**
 * Configuration Bridge — Helper to access system config from other services.
 * Provides typed getters for common configuration values.
 * https://milloapp.com
 */

const systemConfig = require('./systemConfigService');

/**
 * Email configuration
 */
const email = {
  async getProvider() {
    return systemConfig.get('email.provider', 'console');
  },
  async getFromAddress() {
    return systemConfig.get('email.from', 'no-reply@milloapp.com');
  },
  async getSendGridApiKey() {
    return systemConfig.get('email.sendgrid_api_key');
  },
  async getResendApiKey() {
    return systemConfig.get('email.resend_api_key');
  },
  async getSmtpConfig() {
    return {
      host: await systemConfig.get('email.smtp_host'),
      port: await systemConfig.get('email.smtp_port', 587),
      user: await systemConfig.get('email.smtp_user'),
      pass: await systemConfig.get('email.smtp_pass'),
      secure: await systemConfig.get('email.smtp_secure', false),
    };
  },
};

/**
 * AI configuration
 */
const ai = {
  async getOpenAIKey() {
    return systemConfig.get('ai.openai_api_key');
  },
  async getOpenAIModel() {
    return systemConfig.get('ai.openai_model', 'gpt-4');
  },
  async getAnthropicKey() {
    return systemConfig.get('ai.anthropic_api_key');
  },
  async getHiveKey() {
    return systemConfig.get('ai.hive_api_key');
  },
  async isModerationEnabled() {
    return systemConfig.get('ai.moderation_enabled', true);
  },
  async isShadowMode() {
    return systemConfig.get('ai.shadow_mode', true);
  },
};

/**
 * Payments configuration
 */
const payments = {
  async getStripeSecretKey() {
    return systemConfig.get('payments.stripe_secret_key');
  },
  async getStripePublishableKey() {
    return systemConfig.get('payments.stripe_publishable_key');
  },
  async getStripeWebhookSecret() {
    return systemConfig.get('payments.stripe_webhook_secret');
  },
  async getPayPalClientId() {
    return systemConfig.get('payments.paypal_client_id');
  },
  async getPayPalClientSecret() {
    return systemConfig.get('payments.paypal_client_secret');
  },
  async getPayPalMode() {
    return systemConfig.get('payments.paypal_mode', 'sandbox');
  },
  async getWiseApiKey() {
    return systemConfig.get('payments.wise_api_key');
  },
  async getWiseProfileId() {
    return systemConfig.get('payments.wise_profile_id');
  },
};

/**
 * OAuth configuration
 */
const oauth = {
  async getGoogleConfig() {
    return {
      clientId: await systemConfig.get('oauth.google_client_id'),
      clientSecret: await systemConfig.get('oauth.google_client_secret'),
    };
  },
  async getFacebookConfig() {
    return {
      clientId: await systemConfig.get('oauth.facebook_client_id'),
      clientSecret: await systemConfig.get('oauth.facebook_client_secret'),
    };
  },
  async getAppleConfig() {
    return {
      clientId: await systemConfig.get('oauth.apple_client_id'),
      clientSecret: await systemConfig.get('oauth.apple_client_secret'),
    };
  },
  async getGitHubConfig() {
    return {
      clientId: await systemConfig.get('oauth.github_client_id'),
      clientSecret: await systemConfig.get('oauth.github_client_secret'),
    };
  },
  async getEnabledProviders() {
    const providers = [];
    const google = await this.getGoogleConfig();
    if (google.clientId) providers.push('google');
    const facebook = await this.getFacebookConfig();
    if (facebook.clientId) providers.push('facebook');
    const apple = await this.getAppleConfig();
    if (apple.clientId) providers.push('apple');
    const github = await this.getGitHubConfig();
    if (github.clientId) providers.push('github');
    return providers;
  },
};

/**
 * Cloudflare configuration
 */
const cloudflare = {
  async getApiToken() {
    return systemConfig.get('cloudflare.api_token');
  },
  async getAccountId() {
    return systemConfig.get('cloudflare.account_id');
  },
  async getZoneId() {
    return systemConfig.get('cloudflare.zone_id');
  },
  async getR2Config() {
    return {
      accessKey: await systemConfig.get('cloudflare.r2_access_key'),
      secretKey: await systemConfig.get('cloudflare.r2_secret_key'),
      bucket: await systemConfig.get('cloudflare.r2_bucket'),
    };
  },
  async getTurnstileConfig() {
    return {
      siteKey: await systemConfig.get('cloudflare.turnstile_site_key'),
      secretKey: await systemConfig.get('cloudflare.turnstile_secret_key'),
    };
  },
};

/**
 * Storage configuration
 */
const storage = {
  async getProvider() {
    return systemConfig.get('storage.provider', 'local');
  },
  async getS3Config() {
    return {
      bucket: await systemConfig.get('storage.s3_bucket'),
      region: await systemConfig.get('storage.s3_region', 'us-east-1'),
      accessKey: await systemConfig.get('storage.s3_access_key'),
      secretKey: await systemConfig.get('storage.s3_secret_key'),
    };
  },
  async getCdnUrl() {
    return systemConfig.get('storage.cdn_url');
  },
};

/**
 * Streaming configuration
 */
const streaming = {
  async getJanusUrl() {
    return systemConfig.get('streaming.janus_url');
  },
  async getJanusAdminSecret() {
    return systemConfig.get('streaming.janus_admin_secret');
  },
  async getRtmpUrl() {
    return systemConfig.get('streaming.rtmp_url');
  },
  async getHlsUrl() {
    return systemConfig.get('streaming.hls_url');
  },
};

/**
 * Platform configuration
 */
const platform = {
  async getAppName() {
    return systemConfig.get('platform.app_name', 'Millo');
  },
  async getAppUrl() {
    return systemConfig.get('platform.app_url', 'https://milloapp.com');
  },
  async getFrontendUrl() {
    return systemConfig.get('platform.frontend_url', 'https://milloapp.com');
  },
  async getSupportEmail() {
    return systemConfig.get('platform.support_email', 'support@milloapp.com');
  },
  async isMaintenanceMode() {
    return systemConfig.get('platform.maintenance_mode', false);
  },
  async isRegistrationEnabled() {
    return systemConfig.get('platform.registration_enabled', true);
  },
  async isInviteOnly() {
    return systemConfig.get('platform.invite_only', false);
  },
};

module.exports = {
  email,
  ai,
  payments,
  oauth,
  cloudflare,
  storage,
  streaming,
  platform,
  // Direct access to systemConfig
  get: systemConfig.get,
  set: systemConfig.set,
  clearCache: systemConfig.clearCache,
};
