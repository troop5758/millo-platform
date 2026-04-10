'use strict';
const bindings = require('../bindings');

async function stripeWebhookHandler(request, reply) {
  const h = bindings.stripe;
  if (!h) {
    request.log.error('payments/bindings: stripe webhook handler not registered (call paymentsRoutes before paymentsModule)');
    return reply.status(503).send({ error: 'WEBHOOK_NOT_READY' });
  }
  return h(request, reply);
}

module.exports = { stripeWebhookHandler };
