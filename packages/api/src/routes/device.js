'use strict';
/**
 * Device registration — alias-style API for clients expecting POST /device/register.
 * Persists via existing DeviceFingerprint + fraudService.recordDevice (no separate Device collection).
 * Auth: Bearer session required. Body: { deviceId, fp } where deviceId is stable hint (≥8 chars).
 * https://milloapp.com
 */
const db = require('@millo/database');
const fraudService = require('../services/fraudService');
const deviceReputationService = require('../services/deviceReputationService');
const deviceCache = require('../services/deviceCache');
const { linkDeviceToUser } = require('../services/trustGraph.service');
const { FIELD_SEP } = require('../lib/deviceFingerprintHash');
const { resolveSession } = require('./auth');
const { userOptedOutOfFingerprinting } = require('../lib/deviceFingerprintPrivacy');

async function getRequestUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (token) return await resolveSession(token).catch(() => null);
  if (req.user && req.user._id) return req.user;
  if (process.env.NODE_ENV !== 'production') {
    const id = req.headers['x-user-id'];
    if (id) return { _id: id };
  }
  return null;
}

function registerDeviceHandler() {
  return async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (userOptedOutOfFingerprinting(user)) {
      return reply.send({ ok: true, optedOut: true, message: 'Device registration skipped (account preference).' });
    }

    const { deviceId, fp } = request.body ?? {};
    const hint = deviceId != null ? String(deviceId).trim() : '';
    if (!hint || hint.length < 8) {
      return reply.status(400).send({
        error: 'DEVICE_ID_REQUIRED',
        message: 'deviceId must be at least 8 characters (client fingerprint hash or visitor id)',
      });
    }

    const fpObj = fp != null && typeof fp === 'object' && !Array.isArray(fp) ? fp : null;
    const ua = fpObj?.userAgent ?? request.headers['user-agent'] ?? '';
    const screen = fpObj?.screen != null ? String(fpObj.screen) : '';
    const timezone = fpObj?.timezone != null ? String(fpObj.timezone) : '';

    const meta = {};
    if (fpObj) meta.clientFp = fpObj;

    const doc = await fraudService.recordDevice(user._id, hint, {
      ip: request.ip,
      userAgent: ua,
      timezone: timezone || undefined,
      screen: screen || undefined,
      visitorId: hint.slice(0, 128),
      meta: Object.keys(meta).length ? meta : undefined,
    });

    if (!doc) {
      return reply.status(400).send({
        error: 'FINGERPRINT_FAILED',
        message: 'Could not register device',
      });
    }

    const fingerprint = doc.fingerprint;
    if (fpObj) {
      const signals = {};
      if (fpObj.userAgent) signals.userAgent = String(fpObj.userAgent).slice(0, 512);
      if (fpObj.timezone) signals.timezone = String(fpObj.timezone).slice(0, 128);
      if (fpObj.screen) signals.screenResolution = String(fpObj.screen).slice(0, 64);
      if (Object.keys(signals).length) {
        await deviceReputationService.recordSignals(fingerprint, signals).catch(() => {});
      }
    }

    const fresh = await db.DeviceFingerprint.findById(doc._id).lean();

    await deviceCache.cacheDevice({
      userId: String(user._id),
      deviceId: hint.slice(0, 256),
      fingerprint,
      visitorId: fresh?.visitorId ?? doc.visitorId ?? undefined,
      lastSeenAt: fresh?.lastSeenAt ?? doc.lastSeenAt,
      firstSeenAt: fresh?.firstSeenAt ?? doc.firstSeenAt,
    });

    await linkDeviceToUser(user._id, fingerprint, {
      source: 'device_register',
      clientHint: hint.slice(0, 256),
    });

    return reply.send({
      ok: true,
      deviceId: hint.slice(0, 256),
      fingerprint,
      visitorId: fresh?.visitorId ?? doc.visitorId ?? undefined,
      lastSeenAt: fresh?.lastSeenAt ?? doc.lastSeenAt,
      firstSeenAt: fresh?.firstSeenAt ?? doc.firstSeenAt,
      algorithm: 'sha256',
      canonical: 'userAgent+ip+screen+timezone (joined with Unicode record separator before SHA-256)',
      fieldSepCodeUnit: FIELD_SEP.length === 1 ? FIELD_SEP.charCodeAt(0) : undefined,
    });
  };
}

async function deviceRoutes(app) {
  const handler = registerDeviceHandler();
  app.post('/device/register', handler);
  app.post('/api/device/register', handler);
}

module.exports = { deviceRoutes };
