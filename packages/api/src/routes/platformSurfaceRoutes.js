'use strict';
/**
 * Platform UI surfaces — ops health, queue stats, seller onboarding (DB-backed), AI admin controls.
 * Wired for web audit parity (docs/WEB-ROUTE-AUDIT.md). Admin paths require admin role.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { resolveSession } = require('./auth');
const { writeAdminAuditLog } = require('../services/auditLog');
const { getProductionProfilePayload } = require('../services/productionProfileService');
const commerceIntegrity = require('../services/commerceIntegrity.service');

const AI_CONTROLS_KEY = 'admin_ai_controls';
const AI_SHADOW_MODE_KEY = 'ai_shadow_mode';
const AI_CONTROL_KEYS = [
  'shadowMode',
  'moderationEnabled',
  'autoActionEnabled',
  'modelVersion',
  'aiOptimizationEnabled',
  'rankingInjectionActive',
  'adsAiOptimizationActive',
];

async function loadAiControlsStored() {
  const doc = await db.PlatformSettings.findOne({ key: AI_CONTROLS_KEY }).lean();
  const v = doc?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function coerceAiControlKey(key, val) {
  if (key === 'modelVersion') return val == null ? '' : String(val);
  return Boolean(val);
}

function mergeAiControlsSnapshot(envSnapshot, stored) {
  if (!stored) return { ...envSnapshot };
  const out = { ...envSnapshot };
  for (const k of AI_CONTROL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(stored, k)) {
      out[k] = coerceAiControlKey(k, stored[k]);
    }
  }
  return out;
}

function providerLiveSeller() {
  return Boolean(process.env.SELLER_KYC_PROVIDER && String(process.env.SELLER_KYC_PROVIDER).trim() !== '');
}

function stripeConnectOffered(user) {
  return Boolean(process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim() !== '') &&
    user.creatorStatus === 'approved';
}

function mapSellerDocToOnboardingDto(user, doc) {
  const providerLive = providerLiveSeller();
  const meta = (doc && doc.meta && typeof doc.meta === 'object') ? doc.meta : {};
  const onboarding = meta.onboarding && typeof meta.onboarding === 'object' ? meta.onboarding : {};

  if (!doc) {
    return {
      businessType: '',
      legalName: '',
      country: '',
      taxId: '',
      kycStatus: providerLive ? 'pending' : 'not_started',
      documentsSubmitted: false,
      providerLive,
      stripeConnectOffered: stripeConnectOffered(user),
      submissionState: 'draft',
      sellerStatus: 'pending',
      userId: String(user._id),
    };
  }

  let kycStatus = 'not_started';
  if (doc.status === 'approved') kycStatus = 'approved';
  else if (doc.status === 'rejected') kycStatus = 'rejected';
  else if (doc.status === 'pending' && (doc.documentUrl || doc.idDocumentUrl)) kycStatus = 'pending';
  else if (doc.status === 'pending' && !doc.documentUrl) kycStatus = 'not_started';
  else if (doc.status === 'draft') kycStatus = onboarding.documentsSubmitted ? 'pending' : 'not_started';

  let submissionState = 'draft';
  if (doc.status === 'approved') submissionState = 'approved';
  else if (doc.status === 'rejected') submissionState = 'rejected';
  else if (doc.status === 'pending' && (doc.documentUrl || doc.idDocumentUrl)) submissionState = 'in_review';
  else if (doc.status === 'pending' && !doc.documentUrl) submissionState = 'draft';
  else if (doc.status === 'draft') submissionState = 'draft';

  return {
    businessType: String(onboarding.businessType || meta.businessType || ''),
    legalName: String(doc.businessName || onboarding.legalName || meta.legalName || ''),
    country: String(onboarding.country || meta.country || ''),
    taxId: String(doc.taxId || onboarding.taxId || ''),
    sellerStatus: commerceIntegrity.getEffectiveSellerStatus(doc),
    kycStatus,
    documentsSubmitted: Boolean(onboarding.documentsSubmitted || meta.documentsSubmitted),
    providerLive,
    stripeConnectOffered: stripeConnectOffered(user),
    submissionState,
    userId: String(user._id),
    savedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

async function authBearer(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return resolveSession(token).catch(() => null);
}

async function requireUser(request, reply) {
  const user = await authBearer(request);
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return null;
  }
  return user;
}

async function requireAdmin(request, reply) {
  const user = await requireUser(request, reply);
  if (!user) return null;
  const isAdmin =
    user.role === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin')) || user.flags?.isAdmin;
  if (!isAdmin) {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin access required' });
    return null;
  }
  return user;
}

function aiOptimizationEnabledEffective() {
  if (process.env.NODE_ENV === 'production') return process.env.AI_OPTIMIZATION_ENABLED !== 'false';
  return process.env.AI_OPTIMIZATION_ENABLED === 'true';
}

function aiControlsFromEnv() {
  const aiOptimizationEnabled = aiOptimizationEnabledEffective();
  const shadow = process.env.AI_SHADOW_MODE === 'true';
  return {
    shadowMode: shadow,
    moderationEnabled: process.env.AI_MODERATION_ENABLED !== 'false',
    autoActionEnabled: process.env.AI_AUTO_ACTION_ENABLED === 'true',
    modelVersion: process.env.AI_MODERATION_MODEL || '',
    aiOptimizationEnabled,
    rankingInjectionActive:
      aiOptimizationEnabled && !shadow && process.env.AI_RANKING_INJECTION_ENABLED !== 'false',
    adsAiOptimizationActive:
      aiOptimizationEnabled &&
      !shadow &&
      process.env.ADS_ENABLED !== 'false' &&
      process.env.AI_ADS_OPTIMIZATION_ENABLED !== 'false',
  };
}

async function aiControlsEffective() {
  const envSnapshot = aiControlsFromEnv();
  const stored = await loadAiControlsStored();
  return mergeAiControlsSnapshot(envSnapshot, stored);
}

function applyAiControlsToProcessEnv(sanitized) {
  if (!sanitized || typeof sanitized !== 'object') return;
  process.env.AI_SHADOW_MODE = sanitized.shadowMode ? 'true' : 'false';
  process.env.AI_MODERATION_ENABLED = sanitized.moderationEnabled ? 'true' : 'false';
  process.env.AI_AUTO_ACTION_ENABLED = sanitized.autoActionEnabled ? 'true' : 'false';
  process.env.AI_OPTIMIZATION_ENABLED = sanitized.aiOptimizationEnabled !== false ? 'true' : 'false';
  if (sanitized.modelVersion != null) {
    process.env.AI_MODERATION_MODEL = String(sanitized.modelVersion);
  }
}

async function handleAiControlsUpsert(request, reply) {
  const user = await requireAdmin(request, reply);
  if (!user) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const prev = await aiControlsEffective();
  const sanitized = { ...prev };
  for (const k of AI_CONTROL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      sanitized[k] = coerceAiControlKey(k, body[k]);
    }
  }
  try {
    await db.PlatformSettings.findOneAndUpdate(
      { key: AI_CONTROLS_KEY },
      { $set: { key: AI_CONTROLS_KEY, value: sanitized, updatedBy: String(user._id) } },
      { upsert: true, new: true }
    );
    await db.PlatformSettings.findOneAndUpdate(
      { key: AI_SHADOW_MODE_KEY },
      { $set: { key: AI_SHADOW_MODE_KEY, value: Boolean(sanitized.shadowMode), updatedBy: String(user._id) } },
      { upsert: true, new: true }
    );
  } catch (err) {
    request.log.warn({ err }, 'persist admin/ai-controls');
    return reply.status(500).send({ error: 'SAVE_FAILED', message: err.message || 'Failed to persist AI controls' });
  }
  applyAiControlsToProcessEnv(sanitized);
  try {
    await writeAdminAuditLog({
      adminId: user._id,
      action: 'ADMIN_AI_CONTROLS_UPDATED',
      targetType: 'ai_controls',
      targetId: AI_CONTROLS_KEY,
      meta: { controls: sanitized },
    });
  } catch (err) {
    request.log.error({ err }, 'PUT admin/ai-controls: audit log failed after persist');
  }
  return reply.send(sanitized);
}

async function platformSurfaceRoutes(app) {
  app.get('/ops/health', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const productionProfile = getProductionProfilePayload();
    return reply.send({
      status: 'ok',
      updatedAt: new Date().toISOString(),
      services: [{ name: 'api', status: 'up' }],
      productionProfile,
    });
  });

  app.get('/ops/workers', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const { getQueueDashboard } = require('./metrics');
      const workers = await getQueueDashboard();
      return reply.send({ workers, updatedAt: new Date().toISOString() });
    } catch (err) {
      request.log.warn({ err }, 'ops/workers: queue dashboard failed');
      return reply.send({ workers: [], error: err?.message, updatedAt: new Date().toISOString() });
    }
  });

  app.get('/ops/queues', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const { getQueueDashboard } = require('./metrics');
      const queues = await getQueueDashboard();
      return reply.send({ queues, updatedAt: new Date().toISOString() });
    } catch (err) {
      request.log.warn({ err }, 'ops/queues: queue dashboard failed');
      return reply.send({ queues: [], error: err?.message, updatedAt: new Date().toISOString() });
    }
  });

  app.get('/seller/onboarding', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const doc = await db.SellerVerification.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
    return reply.send(mapSellerDocToOnboardingDto(user, doc));
  });

  app.post('/seller/onboarding', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const businessType = String(body.businessType || '').trim().slice(0, 120);
    const legalName = String(body.legalName || '').trim().slice(0, 200);
    const country = String(body.country || '').trim().slice(0, 80);
    const taxId = String(body.taxId || '').trim().slice(0, 50);
    const documentsSubmitted = Boolean(body.documentsSubmitted);

    const existing = await db.SellerVerification.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (existing && existing.sellerStatus === 'blocked') {
      return reply.status(403).send({
        error: 'SELLER_BLOCKED',
        message: 'Your seller account is blocked from commerce. Contact support.',
      });
    }
    if (existing && (existing.status === 'approved' || existing.sellerStatus === 'verified')) {
      return reply.status(409).send({
        error: 'ALREADY_APPROVED',
        message: 'Seller verification is already approved.',
      });
    }
    if (existing && existing.status === 'pending' && (existing.documentUrl || existing.idDocumentUrl)) {
      return reply.status(409).send({
        error: 'PENDING_EXISTS',
        message: 'A verification request is already under review.',
      });
    }

    const meta = {
      ...(existing && existing.meta && typeof existing.meta === 'object' ? existing.meta : {}),
      onboarding: {
        businessType,
        legalName,
        country,
        taxId,
        documentsSubmitted,
        updatedAt: new Date().toISOString(),
      },
    };

    const setDoc = {
      businessName: legalName || (existing && existing.businessName) || '',
      taxId: taxId || undefined,
      meta,
      stage: documentsSubmitted ? 'kyc' : 'email',
    };

    let doc;
    if (existing && (existing.status === 'draft' || (existing.status === 'pending' && !existing.documentUrl))) {
      existing.set({ ...setDoc, status: 'draft' });
      await existing.save();
      doc = existing.toObject();
    } else if (existing && existing.status === 'rejected') {
      existing.set({
        ...setDoc,
        status: 'draft',
        rejectReason: undefined,
        reviewedBy: undefined,
        reviewedAt: undefined,
      });
      await existing.save();
      doc = existing.toObject();
    } else {
      doc = (
        await db.SellerVerification.create({
          userId: user._id,
          ...setDoc,
          status: 'draft',
        })
      ).toObject();
    }

    return reply.send({
      ...mapSellerDocToOnboardingDto(user, doc),
      savedAt: new Date().toISOString(),
    });
  });

  app.get('/admin/ai-controls', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    return reply.send(await aiControlsEffective());
  });

  app.put('/admin/ai-controls', handleAiControlsUpsert);
  app.post('/admin/ai-controls', handleAiControlsUpsert);
}

module.exports = { platformSurfaceRoutes };
