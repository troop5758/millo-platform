'use strict';
/**
 * Phase 11 — Fraud Prevention. Device fingerprint tracking, fraud evaluation.
 * https://milloapp.com
 */
const fraudService = require('../services/fraudService');
const { resolveSession } = require('./auth');
const { userOptedOutOfFingerprinting } = require('../lib/deviceFingerprintPrivacy');

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

async function fraudRoutes(app) {
  /* ── Record device fingerprint (called by frontend after auth) ── */
  app.post('/fraud/track', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (userOptedOutOfFingerprinting(user)) {
      return reply.send({ ok: true, optedOut: true, message: 'Fingerprint track skipped (account preference).' });
    }

    const { fingerprint, visitorId, timezone, screen, screenResolution, userAgent, meta } = req.body ?? {};
    const fpInput = fingerprint || visitorId;
    const ua = userAgent || req.headers['user-agent'];

    const doc = await fraudService.recordDevice(user._id, fpInput, {
      ip: req.ip,
      userAgent: ua,
      timezone,
      screen,
      screenResolution,
      visitorId: visitorId || (fpInput && String(fpInput).length >= 8 ? fpInput : undefined),
      meta,
    });
    if (!doc) {
      return reply.status(400).send({
        error: 'FINGERPRINT_FAILED',
        message: 'Could not record device fingerprint',
      });
    }
    return reply.send({ ok: true, fingerprint: doc.fingerprint });
  });
}

module.exports = { fraudRoutes };
