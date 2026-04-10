'use strict';
/**
 * Creator payout API (facade over billing + orchestration).
 *
 * POST /payout/request     — same as POST /payments/payouts/request (Stripe | PayPal | stripe_connect | Wise | bank_transfer)
 * GET  /payout/history     — user’s PayoutRequest list
 * GET  /payout/providers   — supported provider keys + minimum cents
 *
 * Flow: request → funds reserved on Wallet → pending PayoutRequest → admin approve → billing executes Stripe/PayPal/Wise.
 * https://milloapp.com
 */

const db = require('@millo/database');
const { resolveSession } = require('./auth');
const { handleCreatorPayoutRequest } = require('../services/creatorPayoutRequest.handler');
const paymentOrchestration = require('../services/paymentOrchestration');

const PAYOUT_RATE_LIMIT = {
  max: 3,
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many payout requests. Please try again later.' }),
};

async function authUser(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return resolveSession(token);
}

async function payoutRoutes(app) {
  app.post('/payout/request', { config: { rateLimit: PAYOUT_RATE_LIMIT } }, handleCreatorPayoutRequest);

  app.get('/payout/history', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const payouts = await db.PayoutRequest.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return reply.send({ payouts });
  });

  app.get('/payout/providers', async (_request, reply) => {
    return reply.send({
      providers: paymentOrchestration.VALID_PROVIDERS,
      minPayoutCents: paymentOrchestration.MIN_PAYOUT_CENTS,
      minPayoutDisplayUsd: (paymentOrchestration.MIN_PAYOUT_CENTS / 100).toFixed(2),
    });
  });
}

module.exports = { payoutRoutes };
