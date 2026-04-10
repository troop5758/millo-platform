'use strict';
/**
 * Public system routes — Production Truth / provider status (Fastify).
 * PATCH parity: Express GET /providers → GET /api/system/providers and /system/providers.
 * https://milloapp.com
 */
const path = require('path');
const { getProductionTruth } = require(path.join(__dirname, '../../../../config/production-truth.js'));
const { getControlPlaneSnapshot } = require('../core/control-plane');
const { getTrustEnforcementSnapshot } = require('../services/trustEnforcement');
const { getEmailStatus, getPushStatus } = require('../utils/providerStatus');
const { shouldEnqueueCustomerEmail } = require('../lib/emailQueue');
const { getCapabilities } = require('../config/capabilities');

/**
 * @param {import('fastify').FastifyInstance} app
 */
async function systemRoutes(app) {
  app.get('/api/system/control-plane', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(getControlPlaneSnapshot());
  });
  app.get('/system/control-plane', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(getControlPlaneSnapshot());
  });

  app.get('/api/system/trust-enforcement', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(getTrustEnforcementSnapshot());
  });
  app.get('/system/trust-enforcement', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(getTrustEnforcementSnapshot());
  });

  app.get('/api/system/providers', async (_req, reply) => {
    return reply.send(getProductionTruth());
  });
  app.get('/system/providers', async (_req, reply) => {
    return reply.send(getProductionTruth());
  });

  /** Delivery diagnostics — email/push env modes + notification pipeline (queue → worker → NotificationLog). */
  function deliveryPayload() {
    return {
      email: getEmailStatus(),
      push: getPushStatus(),
      notificationPipeline: {
        channel: 'email',
        capabilityEmail: getCapabilities().notifications.email,
        queue: {
          enabled: shouldEnqueueCustomerEmail(),
          name: 'email',
          job: 'send',
          attempts: 5,
          backoff: { type: 'exponential', delayMs: 5000 },
        },
        deliveryLog: {
          model: 'NotificationLog',
          statuses: ['queued', 'sent', 'failed', 'bounced'],
          fields: ['provider', 'providerMessageId', 'providerResponse', 'error', 'templateKey'],
        },
      },
      ts: new Date().toISOString(),
    };
  }

  app.get('/api/system/delivery', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(deliveryPayload());
  });
  app.get('/system/delivery', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return reply.send(deliveryPayload());
  });
}

module.exports = { systemRoutes };
