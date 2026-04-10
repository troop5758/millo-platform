'use strict';
/**
 * Behavior API — batch interaction snapshots (mouse, clicks, keystroke timings).
 * Public alias: POST /behavior/submit (same payload + semantics as POST /security/behavior/batch).
 * https://milloapp.com
 */
const behaviorMetricsService = require('../services/behaviorMetricsService');
const { resolveSession } = require('./auth');
const { userOptedOutOfFingerprinting } = require('../lib/deviceFingerprintPrivacy');

const BEHAVIOR_SUBMIT_RATE_LIMIT = {
  max: 24,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many behavior submits.' }),
};

async function getRequestUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) return await resolveSession(token).catch(() => null);
  if (request.user && request.user._id) return request.user;
  if (process.env.NODE_ENV !== 'production') {
    const id = request.headers['x-user-id'];
    if (id) return { _id: id };
  }
  return null;
}

async function behaviorRoutes(app) {
  app.post('/behavior/submit', { config: { rateLimit: BEHAVIOR_SUBMIT_RATE_LIMIT } }, async (request, reply) => {
    const user = await getRequestUser(request);
    if (user && userOptedOutOfFingerprinting(user)) {
      return reply.send({ success: true, ok: true, skipped: true, inserted: 0 });
    }

    const { inserted, behaviorRisk } = await behaviorMetricsService.ingestBatchedBehavior(
      user?._id || null,
      request.body ?? {}
    );

    if (inserted > 0 && user?._id) {
      const kafka = require('../services/kafkaEventBus');
      kafka
        .publish(kafka.TOPICS.USER_ACTIVITY, { event: 'behavior_batch', userId: String(user._id), inserted })
        .catch(() => {});
    }

    if (process.env.BEHAVIOR_HTTP_CAPTCHA_403 === 'true' && behaviorRisk?.requireCaptcha) {
      return reply.status(403).send({
        success: false,
        ok: false,
        inserted,
        requireCaptcha: true,
        behaviorRisk,
        siteKey: behaviorRisk.captchaConfig?.siteKey,
        provider: behaviorRisk.captchaConfig?.provider,
      });
    }

    return reply.send({ success: true, ok: true, inserted, behaviorRisk });
  });
}

module.exports = { behaviorRoutes };
