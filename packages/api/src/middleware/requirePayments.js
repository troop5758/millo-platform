'use strict';
/**
 * Payment guard — fail closed unless at least one rail is configured (Stripe, PayPal, or Wise).
 * Attaches `request.stripe` when Stripe client is available (many handlers still use Stripe checkout).
 * https://milloapp.com
 */
const { getCapabilities } = require('../config/capabilities');
const { getStripe } = require('@millo/billing/src/stripe');
const { getControlPlaneModes } = require('../core/control-plane');

/**
 * Fastify preHandler — requires STRIPE_SECRET_KEY and/or PayPal and/or Wise API token.
 */
function requirePayments(request, reply) {
  // Mandatory core: payments must be LIVE in control-plane to proceed.
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
    return reply.status(503).send({
      error: 'payments unavailable',
      mode: 'unknown',
      code: 'SYSTEM_CAPABILITY_DISABLED',
      capability: 'payments',
      message: 'payments is not available in LIVE mode',
    });
  }

  const { payments } = getCapabilities();
  if (!payments.anyConfigured) {
    return reply.status(503).send({
      error: 'PAYMENTS_DISABLED',
      message:
        'Payments disabled: configure STRIPE_SECRET_KEY and/or PAYPAL_CLIENT_ID+SECRET and/or WISE_API_TOKEN. See GET /system/capabilities.',
      capabilities: { payments },
    });
  }
  const stripe = getStripe();
  if (stripe) {
    request.stripe = stripe;
  } else if (payments.stripe) {
    return reply.status(503).send({
      error: 'PAYMENTS_UNAVAILABLE',
      message: 'Stripe is configured in env but the Stripe client failed to initialize.',
      capabilities: { payments },
    });
  }
}

module.exports = { requirePayments };
