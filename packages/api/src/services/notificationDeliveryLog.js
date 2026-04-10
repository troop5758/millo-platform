'use strict';
/**
 * Persist email delivery outcomes for observability (NotificationLog).
 * https://milloapp.com
 */
const db = require('@millo/database');

function normalizeEmailProvider() {
  return String(process.env.EMAIL_PROVIDER || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_') || 'unknown';
}

/**
 * @param {{
 *   userId?: string|null,
 *   status: 'queued'|'sent'|'failed'|'bounced',
 *   error?: string|null,
 *   provider?: string,
 *   templateKey?: string|null,
 *   to?: string|null,
 *   subject?: string|null,
 *   providerMessageId?: string|null,
 *   providerResponse?: object|null,
 *   meta?: object
 * }} row
 * @returns {Promise<string|null>} created document id or null
 */
async function recordEmailNotificationLog(row) {
  const provider = row.provider || normalizeEmailProvider();
  const doc = {
    type: 'email',
    status: row.status,
    provider,
    createdAt: new Date(),
  };
  if (row.userId) doc.userId = row.userId;
  if (row.templateKey) doc.templateKey = String(row.templateKey).slice(0, 128);
  if (row.to) doc.to = String(row.to).trim().slice(0, 512);
  if (row.subject) doc.subject = String(row.subject).trim().slice(0, 512);
  if (row.providerMessageId) doc.providerMessageId = String(row.providerMessageId).slice(0, 512);
  if (row.status === 'sent' || row.status === 'bounced') doc.deliveredAt = new Date();
  if (row.providerResponse && typeof row.providerResponse === 'object') {
    doc.providerResponse = row.providerResponse;
  }
  if (row.meta && typeof row.meta === 'object') doc.meta = row.meta;
  if (row.error != null && row.error !== '') {
    doc.error = String(row.error).slice(0, 2000);
  }
  try {
    const created = await db.NotificationLog.create(doc);
    return String(created._id);
  } catch (err) {
    console.warn('[notificationDeliveryLog] NotificationLog write failed:', err.message);
    return null;
  }
}

module.exports = { recordEmailNotificationLog, normalizeEmailProvider };
