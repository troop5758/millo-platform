'use strict';
/**
 * CAPTCHA challenge — triggered when risk score is high. Providers: Cloudflare Turnstile, hCaptcha, Arkose Labs.
 * https://milloapp.com
 */

const CAPTCHA_THRESHOLD = Number(process.env.CAPTCHA_THRESHOLD) || 70;
const CAPTCHA_PROVIDER = (process.env.CAPTCHA_PROVIDER || '').toLowerCase(); // turnstile | hcaptcha | arkose

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

function turnstileSecret() {
  return process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET || '';
}

function isEnabled() {
  if (!CAPTCHA_PROVIDER) return false;
  if (CAPTCHA_PROVIDER === 'turnstile') return !!turnstileSecret();
  if (CAPTCHA_PROVIDER === 'hcaptcha') return !!process.env.HCAPTCHA_SECRET_KEY;
  if (CAPTCHA_PROVIDER === 'arkose') return !!process.env.ARKOSE_PUBLIC_KEY && !!process.env.ARKOSE_PRIVATE_KEY;
  return false;
}

function getSiteKey() {
  if (CAPTCHA_PROVIDER === 'turnstile') return process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '';
  if (CAPTCHA_PROVIDER === 'hcaptcha') return process.env.HCAPTCHA_SITE_KEY || '';
  if (CAPTCHA_PROVIDER === 'arkose') return process.env.ARKOSE_PUBLIC_KEY || '';
  return '';
}

function getProvider() {
  return CAPTCHA_PROVIDER;
}

/**
 * Return true if CAPTCHA should be required for this risk score.
 */
function requireCaptcha(riskScore) {
  if (!isEnabled()) return false;
  return Number(riskScore) > CAPTCHA_THRESHOLD;
}

/**
 * Return true if CAPTCHA is required for this user (set by automated enforcement pipeline).
 */
async function requireCaptchaForUser(userId) {
  if (!userId) return false;
  try {
    const { isRequireCaptcha } = require('../lib/requireCaptchaRedis');
    return await isRequireCaptcha(userId);
  } catch {
    return false;
  }
}

/**
 * Verify CAPTCHA token with the configured provider. Returns { success: boolean, error?: string }.
 */
async function verifyToken(token, remoteip = null) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { success: false, error: 'CAPTCHA_TOKEN_MISSING' };
  }
  if (!isEnabled()) {
    return { success: true };
  }

  if (CAPTCHA_PROVIDER === 'turnstile') {
    const secret = turnstileSecret();
    if (!secret) return { success: false, error: 'CAPTCHA_NOT_CONFIGURED' };
    const body = new URLSearchParams({ secret, response: token.trim() });
    if (remoteip) body.set('remoteip', remoteip);
    try {
      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) return { success: true };
      return { success: false, error: data['error-codes']?.[0] || 'TURNSTILE_VERIFY_FAILED' };
    } catch (e) {
      return { success: false, error: e.message || 'TURNSTILE_VERIFY_ERROR' };
    }
  }

  if (CAPTCHA_PROVIDER === 'hcaptcha') {
    const secret = process.env.HCAPTCHA_SECRET_KEY;
    if (!secret) return { success: false, error: 'CAPTCHA_NOT_CONFIGURED' };
    const body = new URLSearchParams({ secret, response: token.trim() });
    if (remoteip) body.set('remoteip', remoteip);
    try {
      const res = await fetch(HCAPTCHA_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) return { success: true };
      return { success: false, error: data['error-codes']?.[0] || 'HCAPTCHA_VERIFY_FAILED' };
    } catch (e) {
      return { success: false, error: e.message || 'HCAPTCHA_VERIFY_ERROR' };
    }
  }

  if (CAPTCHA_PROVIDER === 'arkose') {
    // Arkose Labs: server-side verify typically via their API. Stub: require token presence when configured.
    const privateKey = process.env.ARKOSE_PRIVATE_KEY;
    if (!privateKey) return { success: false, error: 'CAPTCHA_NOT_CONFIGURED' };
    // Arkose token verification endpoint and format vary; for now accept non-empty token as passed from client.
    if (token.trim().length > 10) return { success: true };
    return { success: false, error: 'ARKOSE_VERIFY_FAILED' };
  }

  return { success: false, error: 'CAPTCHA_PROVIDER_UNKNOWN' };
}

module.exports = {
  isEnabled,
  getSiteKey,
  getProvider,
  requireCaptcha,
  requireCaptchaForUser,
  verifyToken,
  CAPTCHA_THRESHOLD,
};
