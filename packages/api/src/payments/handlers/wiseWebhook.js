'use strict';
const bindings = require('../bindings');

async function wiseWebhookHandler(request, reply) {
  const h = bindings.wise;
  if (!h) {
    request.log.error('payments/bindings: wise webhook handler not registered');
    return reply.status(503).send({ error: 'WEBHOOK_NOT_READY' });
  }
  return h(request, reply);
}

module.exports = { wiseWebhookHandler };
