/**
 * Behavior tracking SDK — buffers mouse, clicks, keystroke *timings* (no key content), batch POST to API.
 * Privacy: never records `e.key`. Password fields are ignored. Honors opt-out + prefers-reduced-motion.
 * Triggers: sendBehavior() after login, before payments, on suspicious/blocked flows (see authApi, contentApi, LoginPage).
 * API: POST {API}/behavior/submit (alias of /security/behavior/batch; host-rooted, not /api/...).
 * https://milloapp.com
 */

import { API_BASE } from '../config/api.js';

const TOKEN_KEY = 'millo_token';
const USER_KEY = 'millo_user';

const MAX_MOUSE = 800;
const MAX_CLICKS = 200;
const MAX_KEYSTROKES = 400;
const MOUSE_SAMPLE_MS = 48;

/** @type {{ mouseMoves: Array<{ x: number, y: number, t: number }>, clicks: Array<{ x: number, y: number, t: number }>, keystrokes: Array<{ t: number }> }} */
let behaviorData = {
  mouseMoves: [],
  clicks: [],
  keystrokes: [],
};

let tracking = false;
let lastMouseSample = 0;
const cleanups = [];

function userOptedOut() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return false;
    return !!JSON.parse(raw).optOutFingerprinting;
  } catch {
    return false;
  }
}

function shouldTrack() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (userOptedOut()) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* allow */
  }
  return true;
}

function pushCap(arr, max, item) {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

function addListener(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
}

/** Clear in-memory buffers (also called after successful batch send). */
export function resetBehaviorData() {
  behaviorData = { mouseMoves: [], clicks: [], keystrokes: [] };
}

/** Snapshot of buffered events (shallow copy of arrays). */
export function getBehaviorData() {
  return {
    mouseMoves: behaviorData.mouseMoves.slice(),
    clicks: behaviorData.clicks.slice(),
    keystrokes: behaviorData.keystrokes.slice(),
  };
}

/** Remove document listeners. */
export function stopBehaviorTracking() {
  if (!tracking) return;
  tracking = false;
  while (cleanups.length) {
    const off = cleanups.pop();
    try {
      off();
    } catch {
      /* ignore */
    }
  }
}

/** Re-apply privacy / motion prefs after login or preference change. */
export function maybeRestartBehaviorTracking() {
  stopBehaviorTracking();
  initBehaviorTracking();
}

/**
 * Attach passive collectors (idempotent).
 */
export function initBehaviorTracking() {
  if (typeof document === 'undefined' || tracking) return;
  if (!shouldTrack()) return;
  tracking = true;

  addListener(
    document,
    'mousemove',
    (e) => {
      const now = Date.now();
      if (now - lastMouseSample < MOUSE_SAMPLE_MS) return;
      lastMouseSample = now;
      pushCap(behaviorData.mouseMoves, MAX_MOUSE, {
        x: Math.round(e.clientX),
        y: Math.round(e.clientY),
        t: now,
      });
    },
    { passive: true }
  );

  addListener(
    document,
    'click',
    (e) => {
      const now = Date.now();
      pushCap(behaviorData.clicks, MAX_CLICKS, {
        x: Math.round(e.clientX),
        y: Math.round(e.clientY),
        t: now,
      });
    },
    { passive: true }
  );

  addListener(
    document,
    'keydown',
    (e) => {
      const tag = e.target && e.target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
      const input = e.target;
      if (input.type === 'password' || input.autocomplete === 'current-password') return;
      const now = Date.now();
      pushCap(behaviorData.keystrokes, MAX_KEYSTROKES, { t: now });
    },
    true
  );
}

/**
 * Flush buffers to the API. Clears buffers on success. Fire-and-forget safe.
 * @returns {Promise<{ ok?: boolean, skipped?: boolean, inserted?: number }>}
 */
export async function sendBehavior() {
  if (userOptedOut()) return { ok: true, skipped: true };

  const snapshot = getBehaviorData();
  const empty =
    snapshot.mouseMoves.length === 0
    && snapshot.clicks.length === 0
    && snapshot.keystrokes.length === 0;
  if (empty) return { ok: true, skipped: true };

  let token = '';
  try {
    token = localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    /* ignore */
  }

  const res = await fetch(`${API_BASE}/behavior/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(snapshot),
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    resetBehaviorData();
    return { ok: true, inserted: data.inserted };
  }
  const err = new Error(data.message || data.error || `behavior_batch_${res.status}`);
  /** @type {any} */ (err).status = res.status;
  /** @type {any} */ (err).data = data;
  throw err;
}
