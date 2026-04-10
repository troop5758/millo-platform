/**
 * Device fingerprint — stable browser signals + SHA-256 client hint, optional FingerprintJS visitorId.
 * Register with auth: POST {API}/security/device (Bearer), not a public /api/device/register.
 * https://milloapp.com
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedPayload = null;
let cachedString = null;

/** Fingerprint Identification (Pro); when set, load Pro before open-source agent. Public key only — safe in client bundle. */
const FP_PRO_KEY =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_FINGERPRINT_PUBLIC_KEY
    ? String(import.meta.env.VITE_FINGERPRINT_PUBLIC_KEY).trim()
    : '';

const STORED_USER_KEY = 'millo_user';

function userOptedOutFingerprintingFromStorage() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORED_USER_KEY);
    if (!raw) return false;
    return !!JSON.parse(raw).optOutFingerprinting;
  } catch {
    return false;
  }
}

/** Call after updating auth user (e.g. privacy preferences) so fingerprint cache reflects opt-out. */
export function clearDeviceFingerprintSessionCache() {
  cachedPayload = null;
  cachedString = null;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 120, 40);
    ctx.fillStyle = '#069';
    ctx.fillText('Millo', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Millo', 4, 17);
    const data = canvas.toDataURL?.('image/png') || '';
    return simpleHash(data);
  } catch {
    return '';
  }
}

function getScreenFingerprint() {
  try {
    const w = window.screen?.width ?? 0;
    const h = window.screen?.height ?? 0;
    const dpr = window.devicePixelRatio ?? 1;
    const colorDepth = window.screen?.colorDepth ?? 0;
    return `${w}x${h}_${dpr}_${colorDepth}`;
  } catch {
    return '';
  }
}

/**
 * Raw browser signals (no PII). Use as input to {@link generateDeviceHash} for a stable client-side hint.
 */
export function collectDeviceFingerprint() {
  if (typeof navigator === 'undefined') {
    return {
      userAgent: '',
      language: '',
      timezone: '',
      screen: '',
      platform: '',
      cookiesEnabled: false,
    };
  }
  const screen =
    typeof window !== 'undefined' && window.screen
      ? `${window.screen.width ?? 0}x${window.screen.height ?? 0}`
      : '';
  const timezone =
    typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : '';
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone,
    screen,
    platform: navigator.platform,
    cookiesEnabled: !!navigator.cookieEnabled,
  };
}

/**
 * SHA-256 hex digest of `JSON.stringify(fp)` — same idea as `crypto-js/sha256`, via Web Crypto (HTTPS/localhost).
 */
export async function generateDeviceHash(fp) {
  const json = JSON.stringify(fp);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder().encode(json);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const parts = [
    getCanvasFingerprint(),
    getScreenFingerprint(),
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    json,
  ];
  const combined = parts.filter(Boolean).join('|');
  let out = simpleHash(combined);
  while (out.length < 32) out += simpleHash(`${out}|${combined}`);
  return out.slice(0, 64);
}

function legacyCanvasFallbackPayload() {
  const collected = collectDeviceFingerprint();
  const screen = collected.screen
    || (typeof window !== 'undefined' && window.screen
      ? `${window.screen.width ?? 0}x${window.screen.height ?? 0}`
      : '');
  const timezone = collected.timezone
    || (typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : '');
  const parts = [
    getCanvasFingerprint(),
    getScreenFingerprint(),
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timezone,
    typeof navigator !== 'undefined' ? navigator.language : '',
    typeof navigator !== 'undefined' ? String(navigator.hardwareConcurrency ?? '') : '',
    typeof navigator !== 'undefined' ? String(navigator.deviceMemory ?? '') : '',
  ];
  const combined = parts.filter(Boolean).join('|');
  const visitorId = combined ? simpleHash(combined) : simpleHash('millo-fp-empty');
  const safeId = visitorId.length >= 8 ? visitorId : `${visitorId}millofp`.slice(0, 64);
  return {
    visitorId: safeId,
    fingerprint: safeId,
    userAgent: collected.userAgent,
    screen,
    timezone,
    language: collected.language,
    platform: collected.platform,
    cookiesEnabled: collected.cookiesEnabled,
  };
}

/**
 * Full payload for POST /security/device: visitorId (or fingerprint) ≥8 chars, plus ua/screen/tz and extra fields for meta.
 * Prefers FingerprintJS visitorId when available; otherwise SHA-256(collectDeviceFingerprint()).
 */
export async function getDeviceFingerprintPayload() {
  if (userOptedOutFingerprintingFromStorage()) {
    clearDeviceFingerprintSessionCache();
    const collected = collectDeviceFingerprint();
    return {
      visitorId: '',
      fingerprint: '',
      userAgent: collected.userAgent,
      screen: collected.screen,
      timezone: collected.timezone,
      language: collected.language,
      platform: collected.platform,
      cookiesEnabled: collected.cookiesEnabled,
    };
  }
  if (cachedPayload) return cachedPayload;

  const collected = collectDeviceFingerprint();

  const build = (visitorId, fingerprint) => ({
    visitorId,
    fingerprint: fingerprint || visitorId,
    userAgent: collected.userAgent,
    screen: collected.screen,
    timezone: collected.timezone,
    language: collected.language,
    platform: collected.platform,
    cookiesEnabled: collected.cookiesEnabled,
  });

  try {
    if (typeof window === 'undefined') {
      cachedPayload = legacyCanvasFallbackPayload();
      return cachedPayload;
    }
    if (FP_PRO_KEY) {
      try {
        const FingerprintJSPro = await import('@fingerprintjs/fingerprintjs-pro');
        const loader = FingerprintJSPro.default || FingerprintJSPro;
        const fpPro = await loader.load({ apiKey: FP_PRO_KEY });
        const result = await fpPro.get();
        cachedPayload = build(result.visitorId, result.visitorId);
        return cachedPayload;
      } catch {
        /* fall through to open-source agent */
      }
    }
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    cachedPayload = build(result.visitorId, result.visitorId);
    return cachedPayload;
  } catch {
    try {
      const deviceId = await generateDeviceHash(collected);
      if (deviceId && deviceId.length >= 8) {
        cachedPayload = build(deviceId, deviceId);
        return cachedPayload;
      }
    } catch {
      /* use canvas fallback */
    }
    cachedPayload = legacyCanvasFallbackPayload();
    return cachedPayload;
  }
}

/**
 * Stable fingerprint string for other SDK calls (gifts, checkout, etc.).
 * @returns {Promise<string>}
 */
export async function getDeviceFingerprint() {
  if (userOptedOutFingerprintingFromStorage()) {
    clearDeviceFingerprintSessionCache();
    return '';
  }
  if (cachedString != null) return cachedString;
  const payload = await getDeviceFingerprintPayload();
  cachedString = payload.visitorId || '';
  return cachedString;
}
