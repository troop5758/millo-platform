'use strict';
/**
 * Send email — Phase 3 email service (sendgrid, aws_ses, resend, console).
 * EMAIL_PROVIDER required at API boot. Prefer sendCustomerEmail + email queue from the API. Uses email templates for HTML.
 * https://milloapp.com
 */
const emailTemplates = require('./emailTemplates');
const emailService = require('./email');

function sanitizeProviderResponse(result) {
  if (result == null || typeof result !== 'object') return undefined;
  const o = {};
  if ('ok' in result) o.ok = result.ok;
  if (result.messageId != null) o.messageId = String(result.messageId).slice(0, 512);
  if (result.provider != null) o.provider = String(result.provider).slice(0, 64);
  if (result.console != null) o.console = !!result.console;
  if (result.error != null) o.error = String(result.error).slice(0, 2000);
  if (result.skipped != null) o.skipped = !!result.skipped;
  return o;
}

async function recordEmailDeliveryLog(payload = {}) {
  const {
    userId,
    status,
    provider,
    error,
    to,
    subject,
    templateKey,
    providerMessageId,
    providerResponse,
    meta,
  } = payload;
  try {
    const db = require('@millo/database');
    const doc = {
      type: 'email',
      status,
      provider: provider || emailService.getProvider() || 'unknown',
      createdAt: new Date(),
    };
    if (userId) doc.userId = userId;
    if (to) doc.to = String(to).trim().slice(0, 512);
    if (subject) doc.subject = String(subject).trim().slice(0, 512);
    if (templateKey) doc.templateKey = String(templateKey).slice(0, 128);
    if (providerMessageId) doc.providerMessageId = String(providerMessageId).slice(0, 512);
    if (providerResponse && typeof providerResponse === 'object') doc.providerResponse = providerResponse;
    if (status === 'sent' || status === 'bounced') doc.deliveredAt = new Date();
    if (meta && typeof meta === 'object') doc.meta = meta;
    if (error != null && error !== '') doc.error = String(error).slice(0, 2000);
    await db.NotificationLog.create(doc);
  } catch {
    /* never break send path */
  }
}

/**
 * Send an email using the configured transport.
 * @param {object} options
 * @param {string}   options.to         Recipient email address
 * @param {string}   options.subject    Email subject
 * @param {string}   options.title      Email heading
 * @param {string}   options.body       Email body text (plain text or short HTML)
 * @param {string}   [options.ctaUrl]   Call-to-action button URL
 * @param {string}   [options.ctaText]  Call-to-action button label
 * @param {string}   [options.variant]  'light' | 'dark' | 'auto' (default)
 * @param {string}   [options.replyTo]  Reply-to address
 * @param {string}   [options.userId]   Optional user id for NotificationLog
 */
async function sendEmail(options = {}) {
  const {
    to,
    subject,
    title,
    body,
    ctaUrl,
    ctaText,
    variant = 'auto',
    replyTo,
    userId,
    templateKey,
    skipNotificationLog,
  } = options;

  if (!to || !subject) {
    console.warn('[sendEmail] Missing required fields: to, subject');
    if (!skipNotificationLog) {
      await recordEmailDeliveryLog({
        userId,
        status: 'failed',
        provider: emailService.getProvider(),
        error: 'MISSING_FIELDS',
      });
    }
    return { ok: false, error: 'MISSING_FIELDS' };
  }

  const renderFn =
    variant === 'light' ? emailTemplates.renderEmailLight
    : variant === 'dark' ? emailTemplates.renderEmailDark
    : emailTemplates.renderEmail;

  const html = renderFn({ title: title || subject, body: body || '', ctaUrl, ctaText });
  const text = (body || '').replace(/<[^>]+>/g, '') + (ctaUrl ? `\n\n${ctaText || 'Click here'}: ${ctaUrl}` : '');

  try {
    const result = await emailService.send({
      to,
      subject,
      title: title || subject,
      body,
      html,
      text,
      replyTo,
    });
    const pr = sanitizeProviderResponse(result);
    if (!skipNotificationLog) {
      await recordEmailDeliveryLog({
        userId,
        status: result.ok ? 'sent' : 'failed',
        provider: result.provider || emailService.getProvider(),
        error: result.ok ? null : result.error,
        to,
        subject,
        templateKey,
        providerMessageId: result.messageId || result.providerMessageId || null,
        providerResponse: pr,
      });
    }
    return result;
  } catch (err) {
    console.error('[sendEmail] Error:', err.message);
    if (!skipNotificationLog) {
      await recordEmailDeliveryLog({
        userId,
        status: 'failed',
        provider: emailService.getProvider(),
        templateKey,
        error: err.message,
        to: options.to,
        subject: options.subject,
        providerResponse: { ok: false, error: err.message },
      });
    }
    return { ok: false, error: err.message, to, subject, html };
  }
}

module.exports = { sendEmail };
