'use strict';
/**
 * Phase 5 — Creator KYC Verification. Sumsub, Onfido, Persona, Stripe Identity.
 * Stub mode when KYC_PROVIDER=none or no provider configured.
 * Config can be set via Admin Dashboard (System Configuration) or env.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { writeAuditLog } = db;
const compliance = require('@millo/compliance');
const stripe = require('@millo/billing/src/stripe');
const crypto = require('crypto');

let _onfido = null;
let _stripe = null;
let _persona = null;
let _kycConfigCache = null;
let _kycConfigCacheTime = 0;
const KYC_CONFIG_TTL_MS = 30000;

/** Resolve KYC config from admin config or env. Cached for 30s. */
async function getKycConfigSafe() {
  if (_kycConfigCache && Date.now() - _kycConfigCacheTime < KYC_CONFIG_TTL_MS) return _kycConfigCache;
  try {
    const configIntegration = require('./configIntegration');
    _kycConfigCache = await configIntegration.getKycConfig();
    _kycConfigCacheTime = Date.now();
    return _kycConfigCache;
  } catch {
    _kycConfigCache = null;
    return null;
  }
}

/** Current effective provider: from config or env. 'none' = stub mode. */
function getKycProviderSync() {
  return (process.env.KYC_PROVIDER || 'none').toLowerCase().replace(/-/g, '_');
}

async function getKycProvider() {
  const config = await getKycConfigSafe();
  return (config?.provider || process.env.KYC_PROVIDER || 'none').toLowerCase().replace(/-/g, '_');
}

function getOnfido(opts = {}) {
  if (!opts.onfidoApiToken && _onfido !== null) return _onfido;
  const token = opts.onfidoApiToken || process.env.ONFIDO_API_TOKEN;
  if (!token) return null;
  try {
    const { DefaultApi, Configuration, Region } = require('@onfido/api');
    const region = (opts.onfidoRegion || process.env.ONFIDO_REGION || 'eu').toLowerCase() === 'us' ? Region.US : Region.EU;
    const api = new DefaultApi(new Configuration({ apiToken: token, region }));
    if (!opts.onfidoApiToken) _onfido = api;
    return api;
  } catch {
    return null;
  }
}

function getStripe(opts = {}) {
  if (!opts.stripeSecretKey && _stripe !== null) return _stripe;
  const key = opts.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const Stripe = require('stripe');
    const client = new Stripe(key, { apiVersion: '2024-04-10' });
    if (!opts.stripeSecretKey) _stripe = client;
    return client;
  } catch {
    return null;
  }
}

/** Sumsub: use dedicated module when available; opts from admin config. */
function getSumsubOpts(opts = {}) {
  return {
    appToken: opts.sumsubAppToken || process.env.SUMSUB_APP_TOKEN,
    secretKey: opts.sumsubSecretKey || process.env.SUMSUB_SECRET_KEY,
    baseUrl: opts.sumsubBaseUrl || process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com',
    levelName: opts.sumsubLevelName || process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level',
    webhookSecret: opts.sumsubWebhookSecret || process.env.SUMSUB_WEBHOOK_SECRET || process.env.SUMSUB_SECRET_KEY,
  };
}

function getPersona(opts = {}) {
  if (!opts.personaApiKey && _persona !== null) return _persona;
  const apiKey = opts.personaApiKey || process.env.PERSONA_API_KEY;
  const templateId = opts.personaTemplateId || process.env.PERSONA_TEMPLATE_ID;
  if (!apiKey || !templateId) return null;
  const p = { apiKey, templateId, baseUrl: process.env.PERSONA_BASE_URL || 'https://withpersona.com' };
  if (!opts.personaApiKey) _persona = p;
  return p;
}

function toKycStatus(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'approved' || s === 'verified' || s === 'green' || s === 'completed' || s === 'complete') return 'approved';
  if (s === 'rejected' || s === 'declined' || s === 'red' || s === 'failed') return 'rejected';
  if (s === 'in_review' || s === 'pending' || s === 'review' || s === 'processing') return 'in_review';
  return 'pending';
}

async function applyKycStatus(creatorId, status, meta = {}) {
  const next = toKycStatus(status);
  await db.CreatorKyc.findOneAndUpdate(
    { creatorId },
    {
      $set: {
        status: next,
        governmentIdVerified: next === 'approved',
        selfieVerified: next === 'approved',
        updatedAt: new Date(),
        ...(meta.provider ? { provider: meta.provider } : {}),
        ...(meta.verificationId ? { verificationId: meta.verificationId } : {}),
        ...(meta.applicantId ? { applicantId: meta.applicantId } : {}),
        ...(meta.rejectedReason ? { rejectedReason: meta.rejectedReason } : {}),
      },
    },
    { upsert: true }
  );
  if (next === 'approved') {
    compliance.verifyId(creatorId).catch((err) => console.warn('[kyc] verifyId sync failed:', err?.message));
  }
  await writeAuditLog({
    action: 'KYC_STATUS_CHANGED',
    resourceType: 'User',
    resourceId: String(creatorId),
    meta: {
      status: next,
      provider: meta.provider || null,
      verificationId: meta.verificationId || null,
      applicantId: meta.applicantId || null,
      rejectedReason: meta.rejectedReason || null,
    },
  });
  return next;
}

/**
 * Create verification session (provider-specific).
 * Stub mode when provider is 'none' or no credentials configured.
 */
async function createVerificationSession(creatorId, opts = {}) {
  const { returnUrl, type = 'identity' } = opts;
  const kycConfig = await getKycConfigSafe();
  const provider = (kycConfig?.provider || process.env.KYC_PROVIDER || 'none').toLowerCase().replace(/-/g, '_');

  let kyc = await db.CreatorKyc.findOne({ creatorId });
  if (!kyc) {
    kyc = await db.CreatorKyc.create({ creatorId, provider: provider === 'none' ? 'stripe_identity' : provider, status: 'pending' });
  }

  // Explicit stub mode: KYC disabled
  if (provider === 'none') {
    return {
      provider: 'fallback',
      stub: true,
      verificationId: `kyc_stub_${creatorId}_${Date.now()}`,
      message: 'KYC provider not configured (stub mode). Enable Sumsub, Onfido, Stripe Identity, or Persona in Admin → System Configuration.',
    };
  }

  // Sumsub: use dedicated kyc/sumsub module
  if (provider === 'sumsub') {
    const sumsubOpts = getSumsubOpts(kycConfig || {});
    if (!sumsubOpts.appToken || !sumsubOpts.secretKey) {
      return { provider: 'fallback', stub: true, verificationId: `kyc_stub_${creatorId}_${Date.now()}`, message: 'Sumsub not configured' };
    }
    try {
      const sumsubService = require('./kyc/sumsub');
      const applicantResult = await sumsubService.createApplicant(creatorId, {
        ...sumsubOpts,
        email: opts.email,
        firstName: opts.firstName,
        lastName: opts.lastName,
      });
      if (!applicantResult) throw new Error('Sumsub createApplicant returned null');
      const tokenResult = await sumsubService.getAccessToken(String(creatorId), { ...sumsubOpts, ttlInSecs: 900 });
      const applicantId = applicantResult.applicantId;
      const sdkToken = tokenResult?.token || null;

      kyc.provider = 'sumsub';
      kyc.applicantId = applicantId || null;
      kyc.verificationId = applicantId || null;
      kyc.status = 'in_review';
      await kyc.save();

      return {
        provider: 'sumsub',
        applicantId,
        verificationId: applicantId,
        sdkToken,
        verificationUrl: tokenResult?.url || returnUrl || null,
      };
    } catch (err) {
      console.warn('[kyc] Sumsub create failed:', err?.message);
    }
  }

  if (provider === 'persona') {
    const persona = getPersona(kycConfig || {});
    if (persona) try {
      const inquiryRes = await fetch(`${persona.baseUrl}/api/v1/inquiries`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${persona.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            type: 'inquiry',
            attributes: {
              'inquiry-template-id': persona.templateId,
              'reference-id': String(creatorId),
              'redirect-uri': returnUrl || undefined,
            },
          },
        }),
      });
      const inquiryJson = await inquiryRes.json().catch(() => ({}));
      const inquiry = inquiryJson?.data || {};
      const inquiryId = inquiry?.id || null;
      const verificationUrl = inquiry?.attributes?.['inquiry-url'] || null;

      kyc.provider = 'persona';
      kyc.applicantId = String(creatorId);
      kyc.verificationId = inquiryId;
      kyc.status = 'in_review';
      await kyc.save();

      return {
        provider: 'persona',
        applicantId: String(creatorId),
        verificationId: inquiryId,
        verificationUrl,
      };
    } catch (err) {
      console.warn('[kyc] Persona create failed:', err?.message);
    }
  }

  if (provider === 'onfido') {
    const onfido = getOnfido(kycConfig || {});
    if (onfido) try {
      const applicantRes = await onfido.createApplicant({
        first_name: opts.firstName || 'Creator',
        last_name: opts.lastName || 'User',
        email: opts.email || '',
      });
      const sdkTokenRes = await onfido.sdkToken({ applicant_id: applicantRes.data.id, referrer: returnUrl || '*' });
      kyc.applicantId = applicantRes.data.id;
      kyc.status = 'in_review';
      await kyc.save();
      return {
        provider: 'onfido',
        applicantId: applicantRes.data.id,
        sdkToken: sdkTokenRes.data.token,
        verificationUrl: null,
      };
    } catch (err) {
      console.warn('[kyc] Onfido create failed:', err?.message);
    }
  }

  if (provider === 'stripe_identity') {
    const stripeClient = getStripe(kycConfig || {});
    if (stripeClient) try {
      const session = await stripeClient.identity.verificationSessions.create({
        type: 'document',
        metadata: { creator_id: String(creatorId) },
        options: {
          document: { allowed_types: ['driving_license', 'passport'], require_matching_selfie: true },
        },
      });
      kyc.verificationId = session.id;
      kyc.provider = 'stripe_identity';
      kyc.status = 'in_review';
      await kyc.save();
      return {
        provider: 'stripe_identity',
        verificationId: session.id,
        clientSecret: session.client_secret,
        verificationUrl: session.url,
      };
    } catch (err) {
      console.warn('[kyc] Stripe Identity create failed:', err?.message);
    }
  }

  return {
    provider: 'fallback',
    stub: true,
    verificationId: `kyc_stub_${creatorId}_${Date.now()}`,
    message: 'KYC provider not configured. Set KYC_PROVIDER and credentials in Admin → System Configuration (KYC).',
  };
}

/**
 * Check verification status (e.g. from webhook).
 */
async function checkVerificationStatus(verificationId, provider) {
  if (provider === 'stripe_identity' && getStripe()) {
    const session = await getStripe().identity.verificationSessions.retrieve(verificationId);
    const creatorId = session.metadata?.creator_id;
    if (creatorId) {
      const status = session.status === 'verified' ? 'approved' : (session.status === 'requires_input' ? 'in_review' : 'pending');
      await db.CreatorKyc.findOneAndUpdate(
        { creatorId },
        {
          $set: {
            status,
            governmentIdVerified: session.last_verification_report?.document?.status === 'verified',
            selfieVerified: !!session.last_verification_report?.selfie,
            updatedAt: new Date(),
          },
        }
      );
      if (status === 'approved') {
        compliance.verifyId(creatorId).catch((err) => console.warn('[kyc] verifyId sync failed:', err?.message));
      }
      await writeAuditLog({
        action: 'KYC_STRIPE_IDENTITY_SESSION_SYNC',
        resourceType: 'User',
        resourceId: String(creatorId),
        meta: {
          verificationSessionId: session.id,
          sessionStatus: session.status,
          mappedStatus: status,
          provider: 'stripe_identity',
        },
      });
      return { creatorId, status };
    }
  }
  return null;
}

function verifyPersonaSignature(rawBody, headers = {}, opts = {}) {
  const secret = opts.personaWebhookSecret || process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature = headers['persona-signature'] || headers['Persona-Signature'] || '';
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signature.includes(expected);
}

function verifySumsubSignature(rawBody, headers = {}, opts = {}) {
  const secret = opts.sumsubWebhookSecret || opts.sumsubSecretKey || process.env.SUMSUB_WEBHOOK_SECRET || process.env.SUMSUB_SECRET_KEY;
  if (!secret) return true;
  const signature = headers['x-payload-digest'] || headers['X-Payload-Digest'] || '';
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return String(signature).toLowerCase() === expected.toLowerCase();
}

/**
 * Process KYC webhook callback for Sumsub, Persona, or Stripe Identity.
 * @param {'sumsub'|'persona'|'stripe_identity'} provider
 * @param {object} payload
 * @param {object} [opts]
 * @param {object} [opts.headers]
 * @param {string} [opts.rawBody]
 */
async function processWebhook(provider, payload, opts = {}) {
  const headers = opts.headers || {};
  const rawBody = opts.rawBody || '';
  const kycConfig = await getKycConfigSafe();

  if (provider === 'stripe_identity') {
    const session = payload?.data?.object || payload;
    if (!session?.id) return { ok: false, error: 'INVALID_PAYLOAD' };
    const out = await checkVerificationStatus(session.id, 'stripe_identity');
    return { ok: true, provider, ...out };
  }

  if (provider === 'persona') {
    if (!verifyPersonaSignature(rawBody, headers, kycConfig || {})) return { ok: false, error: 'INVALID_SIGNATURE' };
    const data = payload?.data || payload;
    const attrs = data?.attributes || {};
    const referenceId = attrs['reference-id'] || attrs.referenceId || data?.relationships?.account?.data?.id || null;
    if (!referenceId) return { ok: false, error: 'REFERENCE_ID_REQUIRED' };
    const status = toKycStatus(attrs.status || attrs['verification-status'] || payload?.status);
    const next = await applyKycStatus(referenceId, status, {
      provider: 'persona',
      verificationId: data?.id || null,
      rejectedReason: attrs?.fields?.reason || null,
    });
    return { ok: true, provider, creatorId: String(referenceId), status: next };
  }

  if (provider === 'sumsub') {
    if (!verifySumsubSignature(rawBody, headers, kycConfig || {})) return { ok: false, error: 'INVALID_SIGNATURE' };
    const reviewAnswer = payload?.reviewResult?.reviewAnswer || payload?.reviewStatus || payload?.status;
    const applicantId = payload?.applicantId || payload?.id || null;
    const externalUserId = payload?.externalUserId || payload?.externalUserIdRef || null;
    let creatorId = externalUserId;
    if (!creatorId && applicantId) {
      const kyc = await db.CreatorKyc.findOne({ applicantId }).select('creatorId').lean();
      creatorId = kyc?.creatorId ? String(kyc.creatorId) : null;
    }
    if (!creatorId) return { ok: false, error: 'CREATOR_NOT_RESOLVED' };
    const next = await applyKycStatus(creatorId, reviewAnswer, {
      provider: 'sumsub',
      applicantId,
      verificationId: applicantId,
      rejectedReason: payload?.reviewResult?.moderationComment || null,
    });
    return { ok: true, provider, creatorId: String(creatorId), status: next };
  }

  if (provider === 'onfido') {
    const payloadPayload = payload?.payload ?? payload;
    const applicantId = payloadPayload?.applicant_id ?? payload?.applicant_id ?? payload?.resource_id;
    const statusRaw = payloadPayload?.status ?? payload?.status ?? payloadPayload?.result ?? payload?.result;
    const status = toKycStatus(statusRaw === 'clear' ? 'approved' : statusRaw === 'consider' ? 'in_review' : statusRaw);
    if (!applicantId) return { ok: false, error: 'APPLICANT_ID_REQUIRED' };
    const kycDoc = await db.CreatorKyc.findOne({ applicantId }).select('creatorId').lean();
    const creatorId = kycDoc?.creatorId;
    if (!creatorId) return { ok: false, error: 'CREATOR_NOT_RESOLVED' };
    const next = await applyKycStatus(creatorId, status, { provider: 'onfido', applicantId, verificationId: applicantId });
    return { ok: true, provider, creatorId: String(creatorId), status: next };
  }

  return { ok: false, error: 'UNSUPPORTED_PROVIDER' };
}

/**
 * Mark tax form submitted (W-9 / equivalent for US; supports 1099-NEC / year-end reporting via finance export or Stripe Tax).
 */
async function markTaxFormSubmitted(creatorId) {
  await db.CreatorKyc.findOneAndUpdate(
    { creatorId },
    { $set: { taxFormSubmitted: true, updatedAt: new Date() } },
    { upsert: true }
  );
  await writeAuditLog({
    action: 'KYC_TAX_FORM_SUBMITTED',
    userId: creatorId,
    actorId: creatorId,
    resourceType: 'User',
    resourceId: String(creatorId),
    meta: {
      source: 'api',
      taxCompliance: 'w9_or_equivalent',
      reportingNote: 'Year-end 1099-style reporting: export payouts + CreatorKyc; or Stripe Connect / Tax where configured',
    },
  });
}

/**
 * Get KYC status for creator.
 */
async function getKycStatus(creatorId) {
  const kyc = await db.CreatorKyc.findOne({ creatorId }).lean();
  if (!kyc) {
    return { status: 'pending', governmentIdVerified: false, selfieVerified: false, addressVerified: false, taxFormSubmitted: false };
  }
  return {
    status: kyc.status,
    provider: kyc.provider,
    governmentIdVerified: kyc.governmentIdVerified,
    selfieVerified: kyc.selfieVerified,
    addressVerified: kyc.addressVerified,
    taxFormSubmitted: kyc.taxFormSubmitted,
    rejectedReason: kyc.rejectedReason,
  };
}

/**
 * Check if creator is KYC-approved (can receive payouts).
 * In stub mode, if kyc.stub_allows_payout is true (Admin Config), returns true for dev convenience.
 */
async function isKycApproved(creatorId) {
  const config = await getKycConfigSafe();
  const provider = (config?.provider || process.env.KYC_PROVIDER || 'none').toLowerCase();
  const stubAllowsPayout = config?.stubAllowsPayout === true;
  if ((provider === 'none' || !provider) && stubAllowsPayout) {
    return true;
  }
  const kyc = await db.CreatorKyc.findOne({ creatorId }).lean();
  const verified = kyc?.status === 'approved' || kyc?.status === 'verified';
  return verified && kyc?.taxFormSubmitted === true;
}

/**
 * Create Stripe Connect Express account for user (payout onboarding).
 * @param {Object} user - User object with email
 * @returns {Promise<string>} Stripe Connect account ID
 */
async function createKYCAccount(user) {
  const st = stripe.getStripe();
  if (!st) throw new Error('STRIPE_NOT_CONFIGURED');
  const account = await st.accounts.create({
    type: 'express',
    email: user?.email || undefined,
  });
  return account.id;
}

module.exports = {
  createVerificationSession,
  createKYCAccount,
  checkVerificationStatus,
  processWebhook,
  markTaxFormSubmitted,
  getKycStatus,
  isKycApproved,
  getKycProvider,
  getKycProviderSync,
  getKycConfigSafe,
  KYC_PROVIDER: getKycProviderSync(),
};
