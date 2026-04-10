'use strict';
/**
 * Wise provider hooks — verification is done in routes/payments.js via getPaymentProvider('wise').
 * https://milloapp.com
 */

async function processWebhook(event) {
  return { ok: true, event };
}

module.exports = { processWebhook };
