/**
 * Security routes — ledger integrity, kill-switch registry, device fingerprint (TikTok-style).
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');
const security = require('@millo/security');
const fraudService = require('../services/fraudService');
const { FIELD_SEP } = require('../lib/deviceFingerprintHash');
const deviceReputationService = require('../services/deviceReputationService');
const deviceCache = require('../services/deviceCache');
const { linkDeviceToUser } = require('../services/trustGraph.service');
const behaviorMetricsService = require('../services/behaviorMetricsService');
const { resolveSession } = require('./auth');
const { userOptedOutOfFingerprinting } = require('../lib/deviceFingerprintPrivacy');

const BEHAVIOR_RATE_LIMIT = {
  max: 120,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many behavior events.' }),
};

const BEHAVIOR_BATCH_RATE_LIMIT = {
  max: 24,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many behavior batches.' }),
};

async function requireAdmin(request, reply) {
  const user = request.user;
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return false; }
  if (user.role !== 'admin') { reply.status(403).send({ error: 'FORBIDDEN' }); return false; }
  return true;
}

async function getRequestUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) return await resolveSession(token).catch(() => null);
  if (req.user && req.user._id) return req.user;
  if (process.env.NODE_ENV !== 'production') {
    const id = req.headers['x-user-id'];
    if (id) return { _id: id };
  }
  return null;
}

async function securityRoutes(app) {
  /* ── Device fingerprint: visitorId OR Part 8 hash(userAgent + ip + screen + timezone) ── */
  app.post('/security/device', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (userOptedOutOfFingerprinting(user)) {
      return reply.send({
        ok: true,
        optedOut: true,
        message: 'Device fingerprint registration skipped (account preference).',
      });
    }

    const { visitorId, fingerprint, userAgent, screen, timezone, signals, ...meta } = request.body ?? {};
    const ua = userAgent || request.headers['user-agent'] || '';
    const scr = screen != null ? String(screen) : '';
    const fpInput = (visitorId && String(visitorId).trim()) || (fingerprint && String(fingerprint).trim()) || '';

    const doc = await fraudService.recordDevice(user._id, fpInput || null, {
      ip: request.ip,
      userAgent: ua,
      timezone,
      screen: scr,
      visitorId: fpInput && fpInput.length >= 8 ? fpInput : undefined,
      meta: Object.keys(meta).length ? meta : undefined,
    });
    if (!doc) {
      return reply.status(400).send({
        error: 'FINGERPRINT_FAILED',
        message: 'visitorId/fingerprint or userAgent+screen+timezone required for device binding',
      });
    }
    const fp = doc.fingerprint;
    if (signals && typeof signals === 'object') {
      await deviceReputationService.recordSignals(fp, signals).catch(() => {});
    }
    const hintForCache =
      fpInput && String(fpInput).trim().length >= 8 ? String(fpInput).trim().slice(0, 256) : String(fp).slice(0, 256);
    const fresh = await db.DeviceFingerprint.findById(doc._id).lean();
    await deviceCache.cacheDevice({
      userId: String(user._id),
      deviceId: hintForCache,
      fingerprint: fp,
      visitorId: fresh?.visitorId ?? doc.visitorId ?? undefined,
      lastSeenAt: fresh?.lastSeenAt ?? doc.lastSeenAt,
      firstSeenAt: fresh?.firstSeenAt ?? doc.firstSeenAt,
    });

    await linkDeviceToUser(user._id, fp, {
      source: 'security_device',
      clientHint: hintForCache,
    });

    return reply.send({
      ok: true,
      fingerprint: fp,
      algorithm: 'sha256',
      canonical: 'userAgent+ip+screen+timezone (joined with Unicode record separator before SHA-256)',
      fieldSepCodeUnit: FIELD_SEP.length === 1 ? FIELD_SEP.charCodeAt(0) : undefined,
    });
  });

  /* ── Behavior profile (human-likeness + samples) for the authenticated user — feeds risk / trust clients. ── */
  app.get('/security/behavior/profile', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user?._id) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const profile = await behaviorMetricsService.analyzeBehaviorMetrics(user._id);
    return reply.send({ ok: true, profile });
  });

  /* ── Web SDK: batched mouse / click / keystroke timings → BehaviorEvent (see packages/web/src/lib/behavior.js). ── */
  app.post('/security/behavior/batch', { config: { rateLimit: BEHAVIOR_BATCH_RATE_LIMIT } }, async (request, reply) => {
    const user = await getRequestUser(request);
    if (user && userOptedOutOfFingerprinting(user)) {
      return reply.send({ ok: true, skipped: true, inserted: 0 });
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
        ok: false,
        inserted,
        requireCaptcha: true,
        behaviorRisk,
        siteKey: behaviorRisk.captchaConfig?.siteKey,
        provider: behaviorRisk.captchaConfig?.provider,
      });
    }
    return reply.send({ ok: true, inserted, behaviorRisk });
  });

  /* ── Behavioral biometrics ingest → BehaviorEvent; Kafka USER_ACTIVITY for async feature workers. ── */
  app.post('/security/behavior', { config: { rateLimit: BEHAVIOR_RATE_LIMIT } }, async (request, reply) => {
    const user = await getRequestUser(request);
    const body = request.body ?? {};
    const { eventType, metadata, timestamp, sessionId } = body;
    if (!eventType || typeof eventType !== 'string') {
      return reply.status(400).send({ error: 'EVENT_TYPE_REQUIRED', message: 'eventType is required' });
    }
    const type = String(eventType).slice(0, 64);
    const isBiometric = behaviorMetricsService.ALLOWED_EVENT_TYPES.includes(type);
    if (isBiometric) {
      const payload = metadata && typeof metadata === 'object' ? metadata : {};
      if (typeof body.x === 'number') payload.x = body.x;
      if (typeof body.y === 'number') payload.y = body.y;
      if (typeof body.speed === 'number') payload.speed = body.speed;
      if (typeof body.velocity === 'number') payload.velocity = body.velocity;
      if (typeof body.interval === 'number') payload.interval = body.interval;
      if (typeof body.duration === 'number') payload.duration = body.duration;
      const event = await behaviorMetricsService.trackBehavior(user?._id, type, payload, {
        timestamp: timestamp ? new Date(timestamp) : undefined,
        sessionId: sessionId || undefined,
      });
      if (user?._id) {
        const kafka = require('../services/kafkaEventBus');
        kafka.publish(kafka.TOPICS.USER_ACTIVITY, { event: 'behavior', userId: String(user._id), eventType: type }).catch(() => {});
      }
      return reply.send(event ? { ok: true, id: event._id } : { ok: false });
    }
    const event = await db.BehaviorEvent.create({
      userId: user?._id || null,
      eventType: type,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      sessionId: sessionId || null,
    });
    if (user?._id) {
      const kafka = require('../services/kafkaEventBus');
      kafka.publish(kafka.TOPICS.USER_ACTIVITY, { event: 'behavior', userId: String(user._id), eventType: type }).catch(() => {});
    }
    return reply.send({ ok: true, id: event._id });
  });

  app.get('/security/ledger-integrity', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const result = await economy.verifyLedgerIntegrity?.() ?? { valid: false, reason: 'not_available' };
    return reply.send(result);
  });

  app.get('/security/kill-switches', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const registry = security.getKillSwitchRegistry();
    return reply.send(registry);
  });
}

module.exports = { securityRoutes };
