'use strict';
const { stripeWebhookHandler } = require('../handlers/stripeWebhook');
const { paypalWebhookHandler } = require('../handlers/paypalWebhook');
const { wiseWebhookHandler } = require('../handlers/wiseWebhook');

const WEBHOOK_RATE_LIMIT = {
  max: Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 500,
  timeWindow: process.env.WEBHOOK_RATE_LIMIT_WINDOW || '1 minute',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Webhook rate limit exceeded.' }),
};

const WEBHOOK_RAW_CONFIG = { rawBody: true, rateLimit: WEBHOOK_RATE_LIMIT };

async function registerWebhookRoutes(app) {
  app.post('/payments/webhooks/stripe', { config: WEBHOOK_RAW_CONFIG }, stripeWebhookHandler);
  app.post('/webhooks/stripe', { config: WEBHOOK_RAW_CONFIG }, stripeWebhookHandler);

  app.post('/payments/webhooks/paypal', { config: WEBHOOK_RAW_CONFIG }, paypalWebhookHandler);

  app.post('/payments/webhooks/wise', { config: WEBHOOK_RAW_CONFIG }, wiseWebhookHandler);
  app.post('/webhooks/wise', { config: WEBHOOK_RAW_CONFIG }, wiseWebhookHandler);
}

module.exports = { registerWebhookRoutes, WEBHOOK_RAW_CONFIG };
