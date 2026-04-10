'use strict';
/**
 * Customer-facing email dispatch — prefers BullMQ (`email` queue, job `send`) when Redis is configured.
 * Real SMTP/API delivery only when capabilities.notifications.email (not console-only).
 * @see enqueueEmailSend — payload shape { to, template, data }
 * https://milloapp.com
 */
const { getCapabilities } = require('../config/capabilities');
const { sendEmail, assertEmailConfigured } = require('../services/email.service');
const { recordEmailNotificationLog, normalizeEmailProvider } = require('../services/notificationDeliveryLog');
const { enqueueEmailSend, shouldEnqueueCustomerEmail } = require('./emailQueue');
const { getControlPlaneModes } = require('../core/control-plane');
const { sendNotification, shouldEnqueueNotificationPipeline } = require('../core/notifications');

/**
 * @param {object} opts — same as @millo/notifications sendEmail (to, subject, title, body, ctaUrl, ctaText, variant, replyTo)
 * @param {string} [opts.template] — logical template id for logs / routing (default transactional)
 * @param {string|import('mongoose').Types.ObjectId} [opts.userId] — optional; stored on NotificationLog
 */
async function sendCustomerEmail(opts = {}) {
  const { userId, template = 'transactional', to, subject, title, body, ctaUrl, ctaText, variant, replyTo } = opts;

  if (!getCapabilities().notifications.email) {
    return { ok: false, skipped: true, reason: 'EMAIL_CAPABILITY_DISABLED' };
  }
  // Mandatory core: control-plane email must be LIVE for outbound delivery.
  try {
    const mode = getControlPlaneModes().email;
    if (mode !== 'LIVE') {
      return { ok: false, skipped: true, reason: 'EMAIL_CONTROL_PLANE_DISABLED', mode };
    }
  } catch {
    return { ok: false, skipped: true, reason: 'EMAIL_CONTROL_PLANE_DISABLED', mode: 'unknown' };
  }

  try {
    assertEmailConfigured();
  } catch (e) {
    await recordEmailNotificationLog({
      userId,
      status: 'failed',
      error: e.message || 'EMAIL_NOT_CONFIGURED',
    });
    throw e;
  }

  // Prefer enterprise notifications pipeline when Redis is configured (single source of truth in NotificationLog).
  if (shouldEnqueueNotificationPipeline()) {
    try {
      const job = await sendNotification({
        userId: userId ? String(userId) : undefined,
        type: 'email',
        provider: `${normalizeEmailProvider()}_pipeline`,
        to,
        subject,
        title,
        body,
        ctaUrl,
        ctaText,
        templateKey: template,
        meta: { channel: 'email', source: 'customerEmail' },
      });
      return { ok: true, queued: true, to, subject, jobId: String(job.id) };
    } catch {
      // Fall back to legacy email queue / sync delivery.
    }
  }

  if (shouldEnqueueCustomerEmail()) {
    try {
      await enqueueEmailSend({
        to,
        template,
        data: { subject, title, body, ctaUrl, ctaText, variant, replyTo, userId: userId ? String(userId) : undefined },
      });
      await recordEmailNotificationLog({
        userId,
        status: 'queued',
        provider: `${normalizeEmailProvider()}_queue`,
        error: null,
        to,
        subject,
        templateKey: template,
      });
      return { ok: true, queued: true, to, subject };
    } catch {
      /* Redis / queue unavailable — deliver synchronously */
    }
  }

  /* Sync path: NotificationLog is written in @millo/notifications sendEmail */
  return sendEmail({ ...opts, templateKey: template });
}

module.exports = { sendCustomerEmail };
