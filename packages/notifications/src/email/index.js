'use strict';
/**
 * Email service — Providers: sendgrid, aws_ses, resend, smtp, console.
 * EMAIL_PROVIDER is required (no implicit console). Customer sends should use the API email queue when Redis is available.
 * https://milloapp.com
 */
const sendgrid = require('./providers/sendgrid');
const awsSes = require('./providers/awsSes');
const resend = require('./providers/resend');
const smtp = require('./providers/smtp');
const consoleProvider = require('./providers/console');

const PROVIDERS = new Map([
  ['sendgrid', sendgrid],
  ['aws_ses', awsSes],
  ['aws-ses', awsSes],
  ['ses', awsSes],
  ['resend', resend],
  ['smtp', smtp],
  ['nodemailer', smtp],
  ['console', consoleProvider],
]);

// Provider requirements for configuration validation
const PROVIDER_REQUIREMENTS = {
  sendgrid: ['SENDGRID_API_KEY'],
  aws_ses: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  resend: ['RESEND_API_KEY'],
  smtp: ['SMTP_HOST'],
  console: [],
};

let _transporter = null;
let _validated = false;
let _currentProvider = null;

function getFrom() {
  return process.env.EMAIL_FROM || 'no-reply@milloapp.com';
}

/**
 * Get current email provider name.
 */
function getProvider() {
  return _currentProvider || String(process.env.EMAIL_PROVIDER || '').toLowerCase().replace(/-/g, '_');
}

/**
 * Hard require — API/workers must set EMAIL_PROVIDER (use EMAIL_PROVIDER=console for local/test).
 */
function assertEmailProviderConfigured() {
  const raw = process.env.EMAIL_PROVIDER;
  if (raw == null || !String(raw).trim()) {
    throw new Error('Email system not configured');
  }
}

/**
 * Check if a real email provider is configured (not console).
 */
function isRealProviderConfigured() {
  const provider = getProvider();
  return provider !== 'console' && PROVIDERS.has(provider);
}

/** True when email is logged to console only (no external delivery). */
function isConsoleEmailTransport() {
  return getProvider() === 'console';
}

/**
 * Validate EMAIL_PROVIDER at boot. Throws if not set or invalid.
 * @returns {{ valid: boolean, provider: string, warnings: string[], errors: string[] }}
 */
function validateEmailConfig() {
  const warnings = [];
  const errors = [];

  assertEmailProviderConfigured();
  const provider = String(process.env.EMAIL_PROVIDER || '').toLowerCase().replace(/-/g, '_');

  // Check if provider is valid
  const validProviders = [...PROVIDERS.keys()].filter((k) => k !== 'aws-ses' && k !== 'ses' && k !== 'nodemailer');
  if (!PROVIDERS.has(provider)) {
    errors.push(`Invalid EMAIL_PROVIDER: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    if (!_validated) {
      throw new Error(`EMAIL_PROVIDER must be one of: ${validProviders.join(', ')}. Got: ${process.env.EMAIL_PROVIDER}`);
    }
    return { valid: false, provider, warnings, errors };
  }

  // Check required environment variables
  const requirements = PROVIDER_REQUIREMENTS[provider] || [];
  const missing = requirements.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    const msg = `EMAIL_PROVIDER=${provider} requires: ${missing.join(', ')}`;
    errors.push(msg);
    if (!_validated) {
      throw new Error(msg);
    }
  }

  // Production: real SMTP/API provider required for customer email (LAUNCH-BLOCKERS §4)
  if (provider === 'console' && process.env.NODE_ENV === 'production') {
    if (process.env.EMAIL_ALLOW_CONSOLE_IN_PRODUCTION === 'true') {
      warnings.push(
        'Console email in production — messages are not delivered to users (EMAIL_ALLOW_CONSOLE_IN_PRODUCTION=true)'
      );
    } else {
      throw new Error(
        'EMAIL_PROVIDER=console is not allowed in production. Configure sendgrid, smtp, aws_ses, or resend. ' +
          'Sandboxes only: set EMAIL_ALLOW_CONSOLE_IN_PRODUCTION=true.'
      );
    }
  }

  _validated = true;
  _currentProvider = provider;

  // Log configuration status
  if (errors.length === 0 && provider !== 'console') {
    console.info(`[Email] Provider configured: ${provider}`);
  }
  warnings.forEach((w) => console.warn(`[Email] ${w}`));

  return { valid: errors.length === 0, provider, warnings, errors };
}

function getTransporter() {
  if (!_validated) validateEmailConfig();
  if (_transporter) return _transporter;

  const provider = getProvider();
  const impl = PROVIDERS.get(provider) || PROVIDERS.get('console') || consoleProvider;

  _transporter = impl.createTransporter();

  if (!_transporter && provider !== 'console') {
    const reqs = PROVIDER_REQUIREMENTS[provider] || [];
    throw new Error(
      `EMAIL_PROVIDER=${provider} could not create transporter. ` +
      `Required env vars: ${reqs.join(', ')}`
    );
  }

  if (!_transporter) {
    _transporter = consoleProvider.createTransporter();
  }

  return _transporter;
}

/**
 * Reset transporter (for testing or reconfiguration).
 */
function resetTransporter() {
  _transporter = null;
  _validated = false;
  _currentProvider = null;
}

/**
 * Send email via configured provider.
 * @param {{ to, subject, title?, body?, html?, text?, ctaUrl?, ctaText?, replyTo? }} options
 */
async function send(options = {}) {
  const { to, subject, title, body, html, text, replyTo } = options;
  if (!to || !subject) {
    console.warn('[email] Missing to or subject');
    return { ok: false, error: 'MISSING_FIELDS' };
  }
  const transport = getTransporter();
  if (!transport) {
    return { ok: false, error: 'NO_TRANSPORTER' };
  }
  const htmlBody = html || (title || body ? `<h1>${title || subject}</h1><p>${(body || '').replace(/\n/g, '</p><p>')}</p>` : '');
  const textBody = text || (body || '').replace(/<[^>]+>/g, '');
  try {
    const info = await transport.sendMail({
      from: getFrom(),
      to,
      subject,
      html: htmlBody,
      text: textBody,
      replyTo: replyTo || undefined,
    });
    return {
      ok: true,
      messageId: info.messageId,
      to,
      subject,
      provider: getProvider(),
      console: info.console || false,
    };
  } catch (err) {
    console.error('[email] Send error:', err.message);
    return { ok: false, error: err.message, to, subject, provider: getProvider() };
  }
}

/**
 * Health check for email service.
 */
async function healthCheck() {
  const provider = getProvider();
  const result = {
    provider,
    configured: isRealProviderConfigured(),
    from: getFrom(),
  };

  // Console provider is always "healthy" but not delivering
  if (provider === 'console') {
    return {
      ...result,
      healthy: true,
      warning: 'Console transport — emails not delivered',
    };
  }

  try {
    const transport = getTransporter();
    if (!transport) {
      return { ...result, healthy: false, error: 'NO_TRANSPORTER' };
    }

    // Test SMTP connection if available
    if (typeof transport.verify === 'function') {
      await transport.verify();
    }

    return { ...result, healthy: true };
  } catch (err) {
    return { ...result, healthy: false, error: err.message };
  }
}

/**
 * Get email configuration status for admin dashboard.
 */
function getConfigStatus() {
  try {
    const validation = validateEmailConfig();
    return {
      provider: validation.provider,
      valid: validation.valid,
      realProvider: isRealProviderConfigured(),
      from: getFrom(),
      warnings: validation.warnings,
      errors: validation.errors,
      supportedProviders: ['sendgrid', 'aws_ses', 'resend', 'smtp', 'console'],
    };
  } catch (e) {
    return {
      provider: null,
      valid: false,
      realProvider: false,
      from: getFrom(),
      warnings: [],
      errors: [e.message || 'Email system not configured'],
      supportedProviders: ['sendgrid', 'aws_ses', 'resend', 'smtp', 'console'],
    };
  }
}

module.exports = {
  // Configuration
  assertEmailProviderConfigured,
  validateEmailConfig,
  getConfigStatus,
  getFrom,
  getProvider,
  isRealProviderConfigured,
  isConsoleEmailTransport,
  resetTransporter,
  PROVIDERS,
  PROVIDER_REQUIREMENTS,

  // Sending
  send,
  getTransporter,

  // Health
  healthCheck,
};
