'use strict';
/**
 * Shared creator payout request (KYC, wallet reserve, PayoutRequest, audit).
 * Used by POST /payments/payouts/request and POST /payout/request.
 * https://milloapp.com
 */

const db = require('@millo/database');
const fraudService = require('./fraudService');
const paymentOrchestration = require('./paymentOrchestration');
const kafka = require('./kafkaEventBus');
const { resolveSession } = require('../routes/auth');
const { requireVerifiedUser } = require('../middleware/auth.middleware');
const { requireNoRiskLock, requireNotEnforcementRateLimited } = require('../middleware/riskLock');
const { notifyUser } = require('../lib/notifyUser');

async function authUser(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return resolveSession(token);
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
async function handleCreatorPayoutRequest(request, reply) {
  const user = await authUser(request);
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  if (!requireNoRiskLock(request, reply)) return;
  if (!(await requireNotEnforcementRateLimited(request, reply))) return;
  if (!requireVerifiedUser(user, reply)) return;

  const creatorReputationService = require('./creatorReputationService');
  if (!(await creatorReputationService.isPayoutEligible(user._id))) {
    return reply.status(403).send({
      error: 'MONETIZATION_SUSPENDED',
      message: 'Payout eligibility is restricted by your creator reputation score. Please contact support.',
    });
  }

  const body = request.body ?? {};
  let amountCents = body.amountCents;
  if (amountCents == null && body.amount != null) {
    amountCents = Math.round(Number(body.amount) * 100);
  }
  const { provider = 'stripe', destination, payoutEmail, wiseProfileId, currency } = body;

  const payoutRisk = await fraudService.checkPayoutRisk(user._id, amountCents ?? 0);
  if (!payoutRisk.allowed) {
    return reply.status(403).send({
      error: 'PAYOUT_HELD',
      message: 'Payout is held for risk review. Please contact support.',
      fraudScore: payoutRisk.fraudScore,
    });
  }

  const result = await paymentOrchestration.requestCreatorPayout({
    creatorId: user._id,
    amountCents,
    provider,
    destination,
    payoutEmail,
    wiseProfileId,
    currency,
    payoutRiskTier: payoutRisk.tier,
    holdUntil: payoutRisk.holdUntil || undefined,
  });

  if (!result.ok) {
    const status =
      result.error === 'KYC_REQUIRED'
        ? 403
        : result.error === 'PAYOUT_BLOCKED'
          ? 403
          : result.error === 'INSUFFICIENT_BALANCE'
            ? 402
            : result.error === 'PENDING_REQUEST_EXISTS'
              ? 409
              : 400;
    return reply.status(status).send({ error: result.error, message: result.message, ...result });
  }

  await notifyUser(user._id, {
    type: 'payoutRequested',
    title: 'Payout request submitted',
    body: `Your request for $${(amountCents / 100).toFixed(2)} is under review. Processing takes 1-3 business days.`,
    meta: { amountCents, provider: String(provider || 'stripe') },
  }).catch(() => null);

  const { sendEmailWithInboxFallback } = require('./notificationService');
  await sendEmailWithInboxFallback({
    to: user.email,
    subject: `Payout request for $${(amountCents / 100).toFixed(2)} received`,
    title: 'Payout request received',
    body: `We received your payout request for $${(amountCents / 100).toFixed(2)} via ${provider}. We'll process it within 1–3 business days.`,
    ctaUrl: `${process.env.FRONTEND_URL || 'https://milloapp.com'}/dashboard`,
    ctaText: 'View dashboard',
    userId: user._id,
    type: 'payout_email',
  });

  kafka.publish(kafka.TOPICS.PAYMENTS, {
    event: 'payout.requested',
    userId: String(user._id),
    payoutId: String(result.payout?._id || ''),
    amountCents: Number(amountCents) || Number(result.payout?.amountCents) || 0,
    provider: String(provider || 'stripe'),
  }).catch(() => {});

  return reply.status(201).send({ ok: true, payout: result.payout, newBalance: result.newBalance });
}

module.exports = { handleCreatorPayoutRequest };
