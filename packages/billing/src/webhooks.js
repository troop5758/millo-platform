/**
 * Webhook verification — Stripe and PayPal. Reject invalid signatures.
 * Uses PayPal REST API verify-webhook-signature (equivalent to legacy paypal.notification.webhookEvent.verify).
 * https://milloapp.com
 */
const crypto = require('crypto');

const PAYPAL_SANDBOX = 'https://api-m.sandbox.paypal.com';
const PAYPAL_LIVE = 'https://api-m.paypal.com';

function getPayPalBaseUrl() {
  return (process.env.PAYPAL_SANDBOX || '').toLowerCase() === 'true' ? PAYPAL_SANDBOX : PAYPAL_LIVE;
}

/**
 * Get PayPal OAuth access token.
 * @returns {Promise<string|null>}
 */
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const baseUrl = getPayPalBaseUrl();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.access_token || null;
}

/**
 * Verify PayPal webhook via REST API (verify-webhook-signature).
 * Equivalent to legacy paypal.notification.webhookEvent.verify.
 * @param {string} payload - Raw request body (must be unchanged from receipt)
 * @param {object} headers - Request headers (PAYPAL-TRANSMISSION-ID, PAYPAL-TRANSMISSION-SIG, etc.)
 * @returns {Promise<{ok: boolean, event?: object, error?: string}>}
 */
async function verifyPayPalWebhookAsync(payload, headers = {}) {
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const transmissionId = h('paypal-transmission-id');
  const transmissionSig = h('paypal-transmission-sig');
  const transmissionTime = h('paypal-transmission-time');
  const certUrl = h('paypal-cert-url');
  const authAlgo = h('paypal-auth-algo');
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!payload || typeof payload !== 'string') return { ok: false, error: 'INVALID_PAYLOAD' };
  if (!transmissionId || !transmissionSig || !transmissionTime || !certUrl || !authAlgo) {
    return { ok: false, error: 'MISSING_PAYPAL_HEADERS' };
  }
  if (!webhookId) return { ok: false, error: 'PAYPAL_WEBHOOK_NOT_CONFIGURED' };

  const token = await getPayPalAccessToken();
  if (!token) return { ok: false, error: 'PAYPAL_AUTH_FAILED' };

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  const baseUrl = getPayPalBaseUrl();
  const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (json.verification_status === 'SUCCESS') return { ok: true, event };
  return { ok: false, error: json.verification_status || 'VERIFICATION_FAILED' };
}

/**
 * Verify Stripe webhook signature.
 * Header: Stripe-Signature: t=timestamp,v1=signature (HMAC-SHA256 of "timestamp.payload" with endpoint secret).
 * @param {string} payload - Raw request body (must be unchanged from receipt)
 * @param {string} signature - Stripe-Signature header value
 * @param {string} secret - Webhook endpoint secret (whsec_...)
 * @returns {boolean} - true if valid
 */
function verifyStripeWebhook(payload, signature, secret) {
  if (!payload || !signature || !secret) return false;
  const parts = signature.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  if (v1.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Sync PayPal webhook header check (minimal validation).
 * Use verifyPayPalWebhookAsync for full REST API verification.
 * @param {string} payload - Raw request body
 * @param {object} headers - Request headers
 * @returns {boolean} - true if payload and transmission headers present
 */
function verifyPayPalWebhook(payload, headers = {}) {
  if (!payload || typeof payload !== 'string') return false;
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  return !!(h('paypal-transmission-id') && h('paypal-transmission-sig') && h('paypal-transmission-time'));
}

module.exports = { verifyStripeWebhook, verifyPayPalWebhook, verifyPayPalWebhookAsync };
