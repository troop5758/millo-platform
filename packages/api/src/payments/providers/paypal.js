'use strict';
/**
 * PayPal webhook verification lives in @millo/billing (verifyPayPalWebhookAsync). This stub matches the modular layout.
 * https://milloapp.com
 */

async function verifyWebhook(req) {
  const { verifyPayPalWebhookAsync } = require('@millo/billing/src/webhooks');
  const raw = req.rawBody || JSON.stringify(req.body || {});
  return verifyPayPalWebhookAsync(raw, req.headers);
}

module.exports = { verifyWebhook };
