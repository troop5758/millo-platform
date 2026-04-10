'use strict';
/**
 * Modular payments package: webhooks (dispatch to bindings), optional checkout alias, BullMQ worker (optional).
 * `routes/payments.js` must run first and assign `payments/bindings.js` so real handlers are used.
 * https://milloapp.com
 */
const { registerWebhookRoutes } = require('./routes/webhooks');
const { registerCheckoutRoutes } = require('./routes/checkout');
const { registerPayoutRoutes } = require('./routes/payouts');
const { startWebhookWorker } = require('./workers/webhookWorker');

async function paymentsModule(app) {
  await registerWebhookRoutes(app);
  await registerCheckoutRoutes(app);
  await registerPayoutRoutes(app);

  if (process.env.START_WORKERS === 'true' && process.env.PAYMENTS_WEBHOOK_WORKER === 'true') {
    startWebhookWorker(app.log || console);
  }
}

module.exports = {
  paymentsModule,
  registerWebhookRoutes,
  registerCheckoutRoutes,
  registerPayoutRoutes,
  startWebhookWorker,
};
