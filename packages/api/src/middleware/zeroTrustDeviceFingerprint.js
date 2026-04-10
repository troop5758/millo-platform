'use strict';
/**
 * Part 9 — Zero Trust API: JWT (or session) + device fingerprint header.
 * Enable: ZERO_TRUST_DEVICE_FINGERPRINT=true
 * Skip paths: ZERO_TRUST_SKIP_PREFIXES (comma-separated prefixes, see defaults below)
 * https://milloapp.com
 */

const DEFAULT_SKIP_PREFIXES = [
  '/health',
  '/auth/',
  '/payments/webhooks/stripe',
  '/payments/webhooks/paypal',
  '/payments/webhooks/wise',
  '/webhooks/stripe',
  '/webhooks/wise',
];

function parseSkipPrefixes() {
  const raw = process.env.ZERO_TRUST_SKIP_PREFIXES;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_SKIP_PREFIXES;
}

function shouldSkip(path, prefixes) {
  for (const p of prefixes) {
    if (!p) continue;
    if (path === p || path.startsWith(p)) return true;
  }
  return false;
}

function getFingerprintHeader(request) {
  const h = request.headers || {};
  const a = h['x-device-fingerprint'] || h['x-millo-device-fingerprint'];
  if (a == null) return '';
  return String(a).trim();
}

/**
 * Fastify onRequest hook — run after auth middleware so request.user is set.
 */
function createZeroTrustDeviceFingerprintHook() {
  const enabled = process.env.ZERO_TRUST_DEVICE_FINGERPRINT === 'true';
  const prefixes = parseSkipPrefixes();

  return async function zeroTrustDeviceFingerprint(request, reply) {
    if (!enabled) return;

    const path = (request.url || '').split('?')[0] || '';
    if (shouldSkip(path, prefixes)) return;

    if (!request.user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Valid Bearer token required',
      });
    }

    const fp = getFingerprintHeader(request);
    if (fp.length < 8) {
      return reply.status(403).send({
        error: 'DEVICE_FINGERPRINT_REQUIRED',
        message: 'Send X-Device-Fingerprint (or X-Millo-Device-Fingerprint) with your device id from POST /fraud/track or POST /security/device',
      });
    }
  };
}

module.exports = {
  createZeroTrustDeviceFingerprintHook,
  DEFAULT_SKIP_PREFIXES,
};
