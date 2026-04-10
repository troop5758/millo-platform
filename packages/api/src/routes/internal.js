'use strict';
/**
 * Internal / probe routes — secured by env secret, not user sessions.
 * POST /internal/test-email — E2E outbound email probe (requires real email capability).
 * POST /internal/test-notification — full pipeline probe (queue, delivery log, providerResponse).
 * https://milloapp.com
 */
const db = require('@millo/database');
const { getCapabilities } = require('../config/capabilities');
const { sendCustomerEmail } = require('../lib/customerEmail');
const { shouldEnqueueCustomerEmail } = require('../lib/emailQueue');
const branding = require('@millo/notifications/src/branding');

function requireInternalNotificationSecret(request, reply) {
  const secret =
    process.env.INTERNAL_NOTIFICATION_PROBE_SECRET || process.env.INTERNAL_EMAIL_PROBE_SECRET;
  if (!secret || !String(secret).trim()) {
    reply.status(501).send({
      error: 'NOT_CONFIGURED',
      message: 'Set INTERNAL_NOTIFICATION_PROBE_SECRET or INTERNAL_EMAIL_PROBE_SECRET',
    });
    return null;
  }
  const hdr =
    request.headers['x-internal-probe-key'] ||
    request.headers['x-internal-email-probe-key'] ||
    request.headers['x-internal-notification-probe-key'] ||
    '';
  if (hdr !== secret) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return null;
  }
  return secret;
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
async function registerTestEmailProbe(app, path) {
  app.post(path, async (request, reply) => {
    if (!requireInternalNotificationSecret(request, reply)) return;
    if (!getCapabilities().notifications.email) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CAPABLE',
        message: 'Real email delivery is disabled (capabilities.notifications.email is false).',
      });
    }
    const { to, subject } = request.body || {};
    if (!to || typeof to !== 'string' || !String(to).trim()) {
      return reply.status(400).send({ error: 'INVALID_BODY', message: 'to (email string) is required' });
    }
    const result = await sendCustomerEmail({
      template: 'e2e_probe_email',
      to: String(to).trim(),
      subject: subject || `E2E probe — ${branding.getAppName()}`,
      title: 'E2E email probe',
      body: 'This message was sent by POST /internal/test-email to verify outbound email delivery.',
      ctaUrl: branding.getAppUrl(),
      ctaText: 'Open app',
    });
    if (!result || !result.ok) {
      return reply.status(502).send({
        ok: false,
        result,
      });
    }
    return reply.send({ ok: true, result });
  });
}

/**
 * E2E notification pipeline: API → BullMQ (optional) → provider → NotificationLog (+ retries via queue).
 */
async function registerTestNotificationProbe(app, path) {
  app.post(path, async (request, reply) => {
    if (!requireInternalNotificationSecret(request, reply)) return;
    if (!getCapabilities().notifications.email) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CAPABLE',
        message: 'Real email delivery is disabled (capabilities.notifications.email is false).',
      });
    }
    const { to, subject } = request.body || {};
    if (!to || typeof to !== 'string' || !String(to).trim()) {
      return reply.status(400).send({ error: 'INVALID_BODY', message: 'to (email string) is required' });
    }
    const toNorm = String(to).trim();
    const templateKey = 'e2e_notification_probe';
    const result = await sendCustomerEmail({
      template: templateKey,
      to: toNorm,
      subject: subject || `E2E notification pipeline — ${branding.getAppName()}`,
      title: 'E2E notification probe',
      body:
        'This message was sent by POST /internal/test-notification to verify API → queue → provider → delivery log.',
      ctaUrl: branding.getAppUrl(),
      ctaText: 'Open app',
    });

    const log = await db.NotificationLog.findOne({
      to: toNorm,
      templateKey,
    })
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => null);

    const payload = {
      ok: !!(result && result.ok),
      pipeline: {
        channel: 'email',
        queued: !!(result && result.queued),
        queueConfigured: shouldEnqueueCustomerEmail(),
        retry: { attempts: 5, backoff: 'exponential' },
      },
      delivery: result,
      notificationLog: log
        ? {
            id: String(log._id),
            status: log.status,
            provider: log.provider,
            providerMessageId: log.providerMessageId || null,
            providerResponse: log.providerResponse || null,
            error: log.error || null,
            createdAt: log.createdAt,
          }
        : null,
    };

    if (!payload.ok) {
      return reply.status(502).send(payload);
    }
    return reply.send(payload);
  });
}

async function internalRoutes(app) {
  await registerTestEmailProbe(app, '/internal/test-email');
  await registerTestEmailProbe(app, '/api/internal/test-email');
  await registerTestNotificationProbe(app, '/internal/test-notification');
  await registerTestNotificationProbe(app, '/api/internal/test-notification');
}

module.exports = { internalRoutes };
