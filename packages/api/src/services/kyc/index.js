'use strict';
/**
 * Unified KYC service — provider plugins: Stripe Identity, Sumsub, Onfido, Persona.
 * Single entry point for createVerificationSession, processWebhook, getKycStatus, isKycApproved.
 * https://milloapp.com
 */
const kycService = require('../kycService');

const PROVIDERS = Object.freeze(['stripe_identity', 'sumsub', 'onfido', 'persona']);

function getProvider(name) {
  const n = String(name || '').toLowerCase();
  if (PROVIDERS.includes(n)) return n;
  return kycService.KYC_PROVIDER || 'stripe_identity';
}

function listProviders() {
  return [...PROVIDERS];
}

/**
 * Get the configured provider (from env KYC_PROVIDER) or preferred.
 */
function getConfiguredProvider() {
  return getProvider(process.env.KYC_PROVIDER);
}

/**
 * Create verification session — delegates to kycService with provider from env or fallback chain.
 */
async function createVerificationSession(creatorId, opts = {}) {
  return kycService.createVerificationSession(creatorId, opts);
}

/**
 * Process webhook from any supported provider.
 */
async function processWebhook(provider, payload, opts = {}) {
  const p = getProvider(provider);
  if (!PROVIDERS.includes(p)) {
    return { ok: false, error: 'UNSUPPORTED_PROVIDER', supported: PROVIDERS };
  }
  return kycService.processWebhook(p, payload, opts);
}

/**
 * Check verification status (e.g. after redirect or webhook).
 */
async function checkVerificationStatus(verificationId, provider) {
  return kycService.checkVerificationStatus(verificationId, getProvider(provider));
}

async function markTaxFormSubmitted(creatorId) {
  return kycService.markTaxFormSubmitted(creatorId);
}

async function getKycStatus(creatorId) {
  return kycService.getKycStatus(creatorId);
}

async function isKycApproved(creatorId) {
  return kycService.isKycApproved(creatorId);
}

async function createKYCAccount(user) {
  return kycService.createKYCAccount(user);
}

module.exports = {
  getProvider,
  listProviders,
  getConfiguredProvider,
  createVerificationSession,
  processWebhook,
  checkVerificationStatus,
  markTaxFormSubmitted,
  getKycStatus,
  isKycApproved,
  createKYCAccount,
  PROVIDERS,
  KYC_PROVIDER: kycService.KYC_PROVIDER,
};
