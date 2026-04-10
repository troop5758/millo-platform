'use strict';
/**
 * NotificationService — wrapper over email + push + internal inbox.
 * Ensures important messages are visible in-app even when email/push fails.
 * https://milloapp.com
 */

const db = require('@millo/database');
const { getCapabilities } = require('../config/capabilities');
const { sendCustomerEmail } = require('../lib/customerEmail');
const { notifyUser } = require('../lib/notifyUser');

/**
 * Send an email and, if it fails, fall back to an in-app notification.
 *
 * @param {Object} opts
 * @param {string} opts.to        - Recipient email
 * @param {string} opts.subject   - Email subject
 * @param {string} opts.title     - Email / notification title
 * @param {string} opts.body      - Email / notification body
 * @param {string} [opts.ctaUrl]  - Optional button URL
 * @param {string} [opts.ctaText] - Optional button text
 * @param {string} [opts.variant] - Email template variant
 * @param {string|ObjectId} [opts.userId] - User to notify in-app on failure
 * @param {string} [opts.type]    - Notification type (default: 'system_email_fallback')
 */
async function sendEmailWithInboxFallback(opts = {}) {
  const {
    to,
    subject,
    title,
    body,
    ctaUrl,
    ctaText,
    variant,
    userId,
    type = 'system_email_fallback',
  } = opts;

  let emailOk = false;
  if (getCapabilities().notifications.email) {
    try {
      const r = await sendCustomerEmail({
        to,
        subject,
        title,
        body,
        ctaUrl,
        ctaText,
        variant,
        template: type || 'system_email',
        userId,
      });
      emailOk = !!(r && r.ok);
    } catch {
      emailOk = false;
    }
  }

  if (!emailOk && userId) {
    try {
      // Ensure user still exists before writing inbox notification.
      const user = await db.User.findById(userId).select('_id email').lean();
      if (!user) return { emailOk: false, inboxOk: false };
      await notifyUser(userId, {
        type,
        title: title || subject || 'Message from Millo',
        body,
        meta: { ctaUrl, ctaText, to: user.email, emailFailed: true },
      });
      return { emailOk: false, inboxOk: true };
    } catch {
      return { emailOk: false, inboxOk: false };
    }
  }

  return { emailOk, inboxOk: false };
}

module.exports = {
  sendEmailWithInboxFallback,
};

