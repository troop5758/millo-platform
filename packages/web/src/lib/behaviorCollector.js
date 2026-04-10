/**
 * Passive behavior collector — mouse, touch, scroll, typing rhythm (intervals only), session span.
 * Sends batched signals via {@link ./behaviorTelemetry.js trackBehavior} → POST /security/behavior.
 * Respects fingerprint opt-out (same privacy toggle as device binding). Skips when prefers-reduced-motion.
 * https://milloapp.com
 */

import { trackBehavior } from './behaviorTelemetry';

const TOKEN_KEY = 'millo_token';
const USER_KEY = 'millo_user';

let started = false;
const cleanups = [];

function userOptedOutOfInteractionTelemetry() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return false;
    return !!JSON.parse(raw).optOutFingerprinting;
  } catch {
    return false;
  }
}

function shouldCollect() {
  if (typeof window === 'undefined') return false;
  if (userOptedOutOfInteractionTelemetry()) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* collect */
  }
  return true;
}

function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  cleanups.push(() => target.removeEventListener(type, handler, options));
}

/** Tear down listeners (e.g. logout or opt-out). */
export function stopBehaviorCollector() {
  if (!started) return;
  started = false;
  while (cleanups.length) {
    const off = cleanups.pop();
    try {
      off();
    } catch {
      /* ignore */
    }
  }
}

/** Re-read privacy / motion prefs and start again if allowed. */
export function maybeRestartBehaviorCollector() {
  stopBehaviorCollector();
  initBehaviorCollector();
}

/**
 * Start passive collection (idempotent). No-op if already running or disallowed.
 */
export function initBehaviorCollector() {
  if (typeof window === 'undefined' || started) return;
  if (!shouldCollect()) return;
  started = true;

  const sessionStartWall = Date.now();
  const MOUSE_GAP_MS = 380;
  const SCROLL_GAP_MS = 450;
  const MIN_MOVE_SQ = 9;

  /* Mouse / keyboard timing: packages/web/src/lib/behavior.js (batch SDK). */

  let lastTouchEmit = 0;
  let lastTouchT = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  on(
    document,
    'touchmove',
    (e) => {
      if (!e.touches?.length || !localStorage.getItem(TOKEN_KEY)) return;
      const now = Date.now();
      if (now - lastTouchEmit < MOUSE_GAP_MS) return;
      const t = e.touches[0];
      const cx = t.clientX;
      const cy = t.clientY;
      const dx = cx - lastTouchX;
      const dy = cy - lastTouchY;
      if (lastTouchT && (dx * dx + dy * dy) < MIN_MOVE_SQ) return;
      let speed = 0;
      if (lastTouchT) {
        const dt = Math.max(1, now - lastTouchT);
        speed = Math.sqrt(dx * dx + dy * dy) / dt;
      }
      lastTouchX = cx;
      lastTouchY = cy;
      lastTouchT = now;
      lastTouchEmit = now;
      trackBehavior('touch_move', {
        x: Math.round(Math.min(4095, Math.max(0, cx))),
        y: Math.round(Math.min(4095, Math.max(0, cy))),
        speed: Math.round(Math.min(99999, speed * 1000)),
      });
    },
    { passive: true }
  );

  let lastScrollEmit = 0;
  let lastScrollY = window.scrollY;
  let lastScrollT = Date.now();
  on(
    window,
    'scroll',
    () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      const now = Date.now();
      if (now - lastScrollEmit < SCROLL_GAP_MS) return;
      const y = window.scrollY;
      const dt = Math.max(1, now - lastScrollT);
      const velocity = (y - lastScrollY) / dt;
      lastScrollY = y;
      lastScrollT = now;
      lastScrollEmit = now;
      trackBehavior('scroll_speed', {
        velocity: Math.round(Math.min(99999, Math.abs(velocity) * 1000)) * Math.sign(velocity || 1),
      });
    },
    { passive: true }
  );

  let sessionDurationSent = false;
  const flushSession = () => {
    if (sessionDurationSent || !localStorage.getItem(TOKEN_KEY)) return;
    const elapsed = Math.round(Date.now() - sessionStartWall);
    if (elapsed > 5000) {
      sessionDurationSent = true;
      trackBehavior('session_duration', { duration: elapsed });
    }
  };
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSession();
  });
  on(window, 'pagehide', flushSession);
}
