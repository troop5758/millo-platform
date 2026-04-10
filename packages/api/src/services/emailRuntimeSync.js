'use strict';
/**
 * Applies Email Service entries from PlatformSetting (admin dashboard) onto process.env
 * so @millo/notifications and capability checks see the same source of truth as systemConfigService
 * (database overrides env when values are stored).
 * Call after Mongo connects; call again after admin updates any `email.*` key.
 * https://milloapp.com
 */

const systemConfig = require('./systemConfigService');

const EMAIL_SYNC_MAP = [
  {
    key: 'email.provider',
    envVar: 'EMAIL_PROVIDER',
    format: (v) => String(v).trim().toLowerCase().replace(/-/g, '_'),
  },
  { key: 'email.from', envVar: 'EMAIL_FROM', format: String },
  { key: 'email.sendgrid_api_key', envVar: 'SENDGRID_API_KEY', format: String },
  { key: 'email.resend_api_key', envVar: 'RESEND_API_KEY', format: String },
  { key: 'email.smtp_host', envVar: 'SMTP_HOST', format: String },
  { key: 'email.smtp_port', envVar: 'SMTP_PORT', format: (v) => String(v) },
  { key: 'email.smtp_user', envVar: 'SMTP_USER', format: String },
  { key: 'email.smtp_pass', envVar: 'SMTP_PASS', format: String },
  {
    key: 'email.smtp_secure',
    envVar: 'SMTP_SECURE',
    format: (v) => (v === true || v === 'true' ? 'true' : 'false'),
  },
];

/**
 * @param {{ warn?: Function }} [log]
 */
async function syncEmailConfigToProcessEnv(log) {
  for (const { key, envVar, format } of EMAIL_SYNC_MAP) {
    try {
      const raw = await systemConfig.get(key);
      if (raw == null || raw === '') continue;
      process.env[envVar] = format ? format(raw) : String(raw);
    } catch (e) {
      log?.warn?.({ err: e, key }, '[emailRuntimeSync] skipped key');
    }
  }
}

function reloadEmailTransporter() {
  const notif = require('@millo/notifications');
  if (typeof notif.resetTransporter === 'function') notif.resetTransporter();
  if (typeof notif.validateEmailConfig === 'function') notif.validateEmailConfig();
}

/**
 * Sync platform email settings to env and re-validate / rebuild nodemailer transport.
 * @param {{ warn?: Function, error?: Function }} [log]
 */
async function syncAndReloadEmailFromDatabase(log) {
  await syncEmailConfigToProcessEnv(log);
  try {
    reloadEmailTransporter();
  } catch (e) {
    log?.error?.({ err: e }, '[emailRuntimeSync] validateEmailConfig failed');
    throw e;
  }
}

module.exports = {
  EMAIL_SYNC_MAP,
  syncEmailConfigToProcessEnv,
  reloadEmailTransporter,
  syncAndReloadEmailFromDatabase,
};
