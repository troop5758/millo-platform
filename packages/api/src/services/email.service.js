'use strict';
/**
 * API email facade — hard-require EMAIL_PROVIDER before sends (sync or queued upstream).
 * Delegates to @millo/notifications after capability + guard.
 * https://milloapp.com
 */
const { getCapabilities } = require('../config/capabilities');
const { sendEmail: notificationsSendEmail } = require('@millo/notifications');

function assertEmailConfigured() {
  if (process.env.EMAIL_PROVIDER == null || !String(process.env.EMAIL_PROVIDER).trim()) {
    throw new Error('Email system not configured');
  }
}

async function sendEmail(data) {
  if (!getCapabilities().notifications.email) {
    return { ok: false, error: 'EMAIL_CAPABILITY_DISABLED', skipped: true };
  }
  assertEmailConfigured();
  return notificationsSendEmail(data);
}

module.exports = { sendEmail, assertEmailConfigured };
