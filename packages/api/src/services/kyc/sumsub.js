'use strict';
/**
 * Sumsub KYC integration — create applicant, get SDK access token.
 * Uses sumsub-node-sdk when installed (npm install sumsub-node-sdk), otherwise fetch + HMAC.
 * https://milloapp.com
 */

const crypto = require('crypto');

let _sumsubSdk = null;

function getSdk() {
  if (_sumsubSdk !== null) return _sumsubSdk;
  try {
    _sumsubSdk = require('sumsub-node-sdk');
    return _sumsubSdk;
  } catch {
    _sumsubSdk = false;
    return null;
  }
}

/**
 * Get Sumsub config from parameter or env. Credentials can come from admin config via opts.
 * @param {{ appToken?: string, secretKey?: string, baseUrl?: string, levelName?: string }} [opts]
 */
function getConfig(opts = {}) {
  const appToken = opts.appToken || process.env.SUMSUB_APP_TOKEN;
  const secretKey = opts.secretKey || process.env.SUMSUB_SECRET_KEY;
  const baseUrl = (opts.baseUrl || process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com').replace(/\/$/, '');
  const levelName = opts.levelName || process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';
  return { appToken, secretKey, baseUrl, levelName };
}

function isConfigured(opts = {}) {
  const { appToken, secretKey } = getConfig(opts);
  return !!(appToken && secretKey);
}

/**
 * Sign request for Sumsub API (HMAC-SHA256).
 */
function signRequest(secretKey, ts, method, path, body = '') {
  return crypto.createHmac('sha256', secretKey).update(ts + method + path + body).digest('hex');
}

/**
 * Create applicant via Sumsub API (fetch-based, works without SDK).
 */
async function createApplicantFetch(externalUserId, opts = {}) {
  const { appToken, secretKey, baseUrl, levelName } = getConfig(opts);
  if (!appToken || !secretKey) return null;

  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
  const body = JSON.stringify({
    externalUserId: String(externalUserId),
    email: opts.email || undefined,
    fixedInfo: opts.fixedInfo || (opts.firstName || opts.lastName ? {
      firstName: opts.firstName || undefined,
      lastName: opts.lastName || undefined,
    } : undefined),
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = signRequest(secretKey, ts, 'POST', path, body);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': appToken,
      'X-App-Access-Ts': ts,
      'X-App-Access-Sig': sig,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  const applicantId = json?.id || json?.applicantId || externalUserId;
  return { applicantId, raw: json };
}

/**
 * Get SDK access token for frontend Sumsub Web SDK (fetch-based).
 */
async function getAccessTokenFetch(userId, levelName, opts = {}) {
  const { appToken, secretKey, baseUrl, level: configLevel } = getConfig(opts);
  const level = levelName || configLevel;
  if (!appToken || !secretKey) return null;

  const path = '/resources/accessTokens/sdk';
  const body = JSON.stringify({
    userId: String(userId),
    levelName: level,
    ttlInSecs: opts.ttlInSecs || 900,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = signRequest(secretKey, ts, 'POST', path, body);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': appToken,
      'X-App-Access-Ts': ts,
      'X-App-Access-Sig': sig,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return {
    token: json?.token || json?.accessToken || null,
    url: json?.url || null,
  };
}

/**
 * Create applicant. Uses sumsub-node-sdk if available, else fetch.
 * @param {string} userId - External user ID (e.g. creatorId)
 * @param {{ email?: string, firstName?: string, lastName?: string, [key: string]: any }} [opts]
 * @returns {Promise<{ applicantId: string }|null>}
 */
async function createApplicant(userId, opts = {}) {
  const config = getConfig(opts);
  if (!isConfigured(opts)) return null;

  const SumsubSdk = getSdk();
  if (SumsubSdk) {
    try {
      const client = new SumsubSdk(config.baseUrl, config.appToken, config.secretKey);
      const applicant = await client.createApplicant({
        externalUserId: String(userId),
        email: opts.email,
        fixedInfo: (opts.firstName || opts.lastName) ? {
          firstName: opts.firstName,
          lastName: opts.lastName,
        } : undefined,
      });
      const applicantId = applicant?.id || applicant?.applicantId || String(userId);
      return { applicantId };
    } catch (err) {
      console.warn('[kyc/sumsub] SDK createApplicant failed, using fetch:', err?.message);
    }
  }

  const result = await createApplicantFetch(userId, opts);
  return result ? { applicantId: result.applicantId } : null;
}

/**
 * Get SDK access token for frontend. Uses SDK if available, else fetch.
 * @param {string} userId - External user ID
 * @param {{ levelName?: string, ttlInSecs?: number } & import('./index').SumsubConfig} [opts]
 * @returns {Promise<{ token: string|null, url?: string }|null>}
 */
async function getAccessToken(userId, opts = {}) {
  if (!isConfigured(opts)) return null;

  const config = getConfig(opts);
  const levelName = opts.levelName || config.levelName;
  const SumsubSdk = getSdk();
  if (SumsubSdk) {
    try {
      const client = new SumsubSdk(config.baseUrl, config.appToken, config.secretKey);
      const tokenResult = await client.getAccessToken(userId, levelName, opts.ttlInSecs || 900);
      return {
        token: tokenResult?.token ?? tokenResult ?? null,
        url: tokenResult?.url,
      };
    } catch (err) {
      console.warn('[kyc/sumsub] SDK getAccessToken failed, using fetch:', err?.message);
    }
  }

  return getAccessTokenFetch(userId, levelName, opts);
}

/**
 * Verify webhook signature (X-Payload-Digest = HMAC-SHA256(secret, rawBody)).
 */
function verifyWebhookSignature(rawBody, signature, opts = {}) {
  const { secretKey } = getConfig(opts);
  const webhookSecret = opts.webhookSecret || process.env.SUMSUB_WEBHOOK_SECRET || secretKey;
  if (!webhookSecret || !rawBody) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return String(signature || '').toLowerCase() === expected.toLowerCase();
}

module.exports = {
  getConfig,
  isConfigured,
  createApplicant,
  getAccessToken,
  createApplicantFetch,
  getAccessTokenFetch,
  verifyWebhookSignature,
  getSdk,
};
