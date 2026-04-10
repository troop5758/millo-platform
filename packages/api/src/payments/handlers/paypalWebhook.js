'use strict';
const bindings = require('../bindings');

async function paypalWebhookHandler(request, reply) {
  const h = bindings.paypal;
  if (!h) {
    request.log.error('payments/bindings: paypal webhook handler not registered');
    return reply.status(503).send({ error: 'WEBHOOK_NOT_READY' });
  }
  return h(request, reply);
}

module.exports = { paypalWebhookHandler };
