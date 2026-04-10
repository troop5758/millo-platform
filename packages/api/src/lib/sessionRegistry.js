'use strict';
/**
 * Session registry helpers — device name from user-agent, location string from geo.
 * https://milloapp.com
 */

/**
 * Derive a short device name for display (e.g. "Chrome on Windows", "Safari on iPhone").
 * @param {string} [userAgent] - request.headers['user-agent']
 * @param {string} [deviceType] - 'ios' | 'android' | 'web'
 */
function deriveDeviceName(userAgent, deviceType) {
  if (deviceType && ['ios', 'android', 'web'].includes(String(deviceType).toLowerCase())) {
    const t = String(deviceType).toLowerCase();
    if (t === 'ios') return 'Safari on iPhone';
    if (t === 'android') return 'Chrome on Android';
    if (t === 'web') return 'Web Browser';
  }
  const ua = (userAgent || '').slice(0, 512);
  if (!ua) return 'Unknown Device';
  const isiPhone = /iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Mac OS X|Macintosh/i.test(ua);
  const isWindows = /Windows NT|Windows/i.test(ua);
  const isChrome = /Chrome\/|CriOS\//i.test(ua) && !/Edge/i.test(ua);
  const isSafari = /Safari\/|Version\//i.test(ua) && !/Chrome/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isEdge = /Edge\/|Edg\//i.test(ua);
  let browser = 'Browser';
  if (isChrome) browser = 'Chrome';
  else if (isSafari) browser = 'Safari';
  else if (isFirefox) browser = 'Firefox';
  else if (isEdge) browser = 'Edge';
  let os = '';
  if (isiPhone) os = 'iPhone';
  else if (isAndroid) os = 'Android';
  else if (isMac) os = 'Mac';
  else if (isWindows) os = 'Windows';
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Build location string from geo lookup result.
 * @param {{ city?: string, country?: string }} [geo]
 */
function buildLocationString(geo) {
  if (!geo) return null;
  const parts = [geo.city, geo.country].filter(Boolean).map((s) => String(s).trim());
  return parts.length ? parts.join(', ') : null;
}

module.exports = { deriveDeviceName, buildLocationString };
