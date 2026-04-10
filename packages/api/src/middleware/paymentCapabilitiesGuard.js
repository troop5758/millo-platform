'use strict';
/**
 * When no payment rail is configured, reject the payment HTTP surface with 503.
 * Complements per-route requirePayments — runs first on every /payments/* alias.
 * https://milloapp.com
 */

const { getCapabilities, isPaymentSurfacePath } = require('../config/capabilities');
const { getControlPlaneModes } = require('../core/control-plane');

/**
 * Fastify onRequest hook — register on root app (or payment plugin scope).
 */
async function blockPaymentRoutesWithoutStripe(request, reply) {
  if (request.method === 'OPTIONS') return;

  const raw = request.raw?.url || request.url || '';
  const pathname = raw.split('?')[0] || '';
  if (!isPaymentSurfacePath(pathname)) return;

  // Mandatory core: control-plane must be LIVE for payments surface (env config alone is not enough).
  // This allows production-truth to disable payments even when rails are configured.
  try {
    const mode = getControlPlaneModes().payments;
    if (mode !== 'LIVE') {
      return reply.status(503).send({
        error: 'payments unavailable',
        mode,
        code: 'SYSTEM_CAPABILITY_DISABLED',
        capability: 'payments',
        message: 'payments is not available in LIVE mode',
      });
    }
  } catch {
    // Fail closed if control-plane cannot be evaluated (production posture).
    return reply.status(503).send({
      error: 'payments unavailable',
      mode: 'unknown',
      code: 'SYSTEM_CAPABILITY_DISABLED',
      capability: 'payments',
      message: 'payments is not available in LIVE mode',
    });
  }

  const { payments } = getCapabilities();
  if (payments.anyConfigured) return;

  return reply.status(503).send({
    error: 'PAYMENTS_UNAVAILABLE',
    message:
      'Payment routes are disabled: set STRIPE_SECRET_KEY and/or PayPal client credentials and/or WISE_API_TOKEN. See GET /system/capabilities.',
    capabilities: { payments },
  });
}

module.exports = { blockPaymentRoutesWithoutStripe };
