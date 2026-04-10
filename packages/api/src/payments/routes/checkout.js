'use strict';
const { createCheckoutSession } = require('../providers/stripe');
const { resolveSession } = require('../../routes/auth');
const { requirePayments } = require('../../middleware/requirePayments');

const PAYMENT_RATE_LIMIT = {
  max: 20,
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many payment requests. Please try again later.' }),
};

async function registerCheckoutRoutes(app) {
  app.post(
    '/payments/coins/checkout',
    { preHandler: [requirePayments], config: { rateLimit: PAYMENT_RATE_LIMIT } },
    async (request, reply) => {
      const token = (request.headers.authorization || '').replace('Bearer ', '').trim();
      const user = await resolveSession(token);
      if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

      const { amountCents } = request.body || {};
      if (amountCents == null || Number(amountCents) < 50) {
        return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'amountCents required (min 50).' });
      }

      try {
        const session = await createCheckoutSession({ userId: user._id, amountCents: Number(amountCents) });
        return reply.send({ url: session.url });
      } catch (e) {
        const code = e.code === 'STRIPE_NOT_CONFIGURED' ? 503 : 500;
        return reply.status(code).send({ error: e.code || 'CHECKOUT_FAILED', message: e.message });
      }
    }
  );
}

module.exports = { registerCheckoutRoutes };
