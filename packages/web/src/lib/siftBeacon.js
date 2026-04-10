/**
 * Sift Science client beacon — Phase 11 fraud detection.
 * Loads when VITE_SIFT_BEACON_KEY is set. Tracks pageviews and user identity.
 * https://milloapp.com
 */

const BEACON_KEY = import.meta.env.VITE_SIFT_BEACON_KEY;

function getSessionId() {
  try {
    let sid = sessionStorage.getItem('millo_sift_session');
    if (!sid) {
      sid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('millo_sift_session', sid);
    }
    return sid;
  } catch {
    return `s_${Date.now()}`;
  }
}

function ensureSiftLoaded() {
  if (window._sift) return;
  window._sift = [];
  const script = document.createElement('script');
  script.src = 'https://cdn.sift.com/s.js';
  script.async = true;
  document.head.appendChild(script);
}

/**
 * Initialize Sift beacon. Call once on app load when key is configured.
 * Does not track pageview — use trackSiftPageview for that.
 */
export function initSiftBeacon(userId = null) {
  if (!BEACON_KEY) return;
  try {
    ensureSiftLoaded();
    window._sift.push(['_setAccount', BEACON_KEY]);
    window._sift.push(['_setSessionId', getSessionId()]);
    if (userId) window._sift.push(['_setUserId', String(userId)]);
  } catch (e) {
    console.warn('[Sift] init failed:', e?.message);
  }
}

/**
 * Track pageview. Call on route change (SPA).
 */
export function trackSiftPageview(userId = null) {
  if (!BEACON_KEY || !window._sift) return;
  try {
    if (userId) window._sift.push(['_setUserId', String(userId)]);
    window._sift.push(['_trackPageview']);
  } catch (e) {
    console.warn('[Sift] pageview failed:', e?.message);
  }
}

export function isSiftEnabled() {
  return !!BEACON_KEY;
}
