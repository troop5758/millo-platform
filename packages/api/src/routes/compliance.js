/**
 * Compliance API — DSAR, consent, age gating. Phase 8: GDPR, CCPA, LGPD, PIPEDA.
 * https://milloapp.com
 */
const compliance = require('@millo/compliance');
const dashboards = require('@millo/dashboards');
const { resolveSession } = require('./auth');

async function getRequestUser(req) {
  if (req.user && req.user._id) return req.user;
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) return await resolveSession(token).catch(() => null);
  if (process.env.NODE_ENV === 'production') return null;
  const id = req.headers['x-user-id'];
  const role = req.headers['x-user-role'] || 'user';
  if (!id) return null;
  return { _id: id, role };
}

async function complianceRoutes(app) {

  /* ── Phase 8: DSAR request — create data subject access request ── */
  /* ── DSAR request list (self-service status; no GET /dsar/status — use this) ── */
  app.get('/dsar/requests', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const requests = await compliance.listDsarForUser(user._id);
    return reply.send({ ok: true, requests });
  });

  app.post('/dsar/request', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { type, lawBasis } = req.body ?? {};
    if (!['export', 'delete', 'rectification', 'restriction'].includes(type)) {
      return reply.status(400).send({ error: 'INVALID_TYPE', valid: ['export', 'delete', 'rectification', 'restriction'] });
    }
    const request = await compliance.requestDsar(user._id, type, {
      lawBasis: ['gdpr', 'ccpa', 'lgpd', 'pipeda'].includes(lawBasis) ? lawBasis : 'gdpr',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.status(201).send({ ok: true, request });
  });

  /* ── Phase 8: DSAR export — data export (DSAR) ── */
  app.get('/dsar/export', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const targetUserId = req.query?.userId || user._id;
    const targetIdStr = targetUserId?.toString();
    const selfIdStr = user._id?.toString();
    if (targetIdStr !== selfIdStr && !dashboards.hasRole(user, 'admin') && !dashboards.hasRole(user, 'support')) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    const data = await compliance.exportUserData(targetUserId);
    return reply.send(data);
  });

  /* ── Phase 8: DSAR delete — account deletion (right to erasure) ── */
  app.post('/dsar/delete', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { confirm, immediate } = req.body ?? {};
    if (confirm !== true && confirm !== 'true') {
      return reply.status(400).send({ error: 'CONFIRM_REQUIRED', message: 'Set confirm: true to confirm account deletion.' });
    }
    const result = await compliance.deleteUserData(user._id, { immediate: !!immediate });
    return reply.send({ ok: true, ...result });
  });

  /* ── Legacy: DSAR data subject (self) or admin/support ── */
  app.get('/compliance/dsar', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const targetUserId = req.query?.userId || user._id;
    const targetIdStr = targetUserId?.toString();
    const selfIdStr = user._id?.toString();
    if (targetIdStr && targetIdStr !== selfIdStr && !dashboards.hasRole(user, 'admin') && !dashboards.hasRole(user, 'support')) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    try {
      const data = await compliance.exportUserData(targetUserId);
      return reply.send(data);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });

  app.post('/compliance/consent', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const userId = req.body?.userId || user._id;
    if (userId !== user._id?.toString() && userId !== user._id) return reply.status(403).send({ error: 'FORBIDDEN' });

    const { purpose, version, granted } = req.body || {};
    if (!purpose || typeof purpose !== 'string' || purpose.trim().length === 0) {
      return reply.status(400).send({ error: 'PURPOSE_REQUIRED', message: 'purpose is required' });
    }
    if (purpose.length > 100) {
      return reply.status(400).send({ error: 'PURPOSE_TOO_LONG', message: 'purpose must be 100 characters or fewer' });
    }
    if (!version || typeof version !== 'string') {
      return reply.status(400).send({ error: 'VERSION_REQUIRED', message: 'version is required (e.g. "1.0")' });
    }
    if (granted !== undefined && typeof granted !== 'boolean') {
      return reply.status(400).send({ error: 'INVALID_GRANTED', message: 'granted must be a boolean' });
    }

    try {
      await compliance.logConsent(userId, purpose.trim(), version.trim(), granted ?? true, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        meta: req.body?.meta,
      });
      return reply.send({ ok: true });
    } catch (e) {
      throw e;
    }
  });

  /* ── Creator payout compliance: KYC (incl. Stripe Identity), tax W-9 / 1099 pipeline, audit trail ── */
  app.get('/compliance/creator/payout-requirements', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const kycService = require('../services/kycService');
    const kyc = await kycService.getKycStatus(user._id);
    const payoutReady = await kycService.isKycApproved(user._id).catch(() => false);
    return reply.send({
      ok: true,
      kyc,
      payoutReady,
      requirements: [
        { id: 'identity', label: 'Government ID + selfie (KYC)', done: kyc.status === 'approved' || kyc.governmentIdVerified === true },
        { id: 'tax_form', label: 'Tax form (W-9 or equivalent; 1099-NEC reporting via finance export / Stripe)', done: kyc.taxFormSubmitted === true },
      ],
      endpoints: {
        kycStart: '/payments/kyc/start',
        kycStatus: '/payments/kyc/status',
        kycWebhookStripeIdentity: '/payments/kyc/webhook/stripe_identity',
        taxFormSubmit: '/payments/kyc/tax-form',
      },
    });
  });

  app.get('/compliance/age-check', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const userId = req.query?.userId || user._id;
    if (userId !== user._id?.toString() && userId !== user._id) return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const result = await compliance.isAgeAllowed(userId, req.query?.minimumAge ? Number(req.query.minimumAge) : undefined);
      return reply.send(result);
    } catch (e) {
      throw e;
    }
  });

  /* ── Phase 9: Adult content — age gate modal, age verification ── */
  app.get('/compliance/age-gate', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const regionCode = req.region?.user_compliance_zone || req.query?.region || 'US';
    const minimumAge = req.query?.minimumAge ? Number(req.query.minimumAge) : compliance.ADULT_MINIMUM_AGE;
    const result = await compliance.getAgeGateStatus(user._id, regionCode, minimumAge);
    return reply.send(result);
  });

  app.post('/compliance/age-verify', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const minimumAge = req.body?.minimumAge ? Number(req.body.minimumAge) : compliance.ADULT_MINIMUM_AGE;
    const result = await compliance.verifyAge(user._id, minimumAge);
    if (!result.verified) {
      return reply.status(400).send({ error: result.reason, message: result.message, age: result.age });
    }
    return reply.send({ ok: true, verified: true });
  });

  /* ── CCPA Do Not Sell opt-out (Phase 11) ── */
  app.get('/compliance/ccpa/do-not-sell', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const result = await compliance.getCcpaDoNotSellStatus(user._id);
    return reply.send(result);
  });

  app.post('/compliance/ccpa/do-not-sell', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const optedOut = req.body?.optedOut === true || req.body?.optedOut === 'true';
    await compliance.logCcpaDoNotSell(user._id, optedOut, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true, optedOut });
  });

  /* ── IP logging toggle (Phase 11) ── */
  app.get('/compliance/ip-logging', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const result = await compliance.getIpLoggingStatus(user._id);
    return reply.send(result);
  });

  app.post('/compliance/ip-logging', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const allowIpLogging = req.body?.allowIpLogging !== false && req.body?.allowIpLogging !== 'false';
    await compliance.logIpLoggingPreference(user._id, allowIpLogging, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true, allowIpLogging });
  });
}

module.exports = { complianceRoutes };
