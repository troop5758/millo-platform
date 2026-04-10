/**
 * Behavioral AI detection — telemetry for human vs bot signals.
 * Human: irregular scroll, pauses, variable typing, random click timing.
 * Bot: perfectly timed actions, identical intervals, high volume, no mouse movement.
 * https://milloapp.com
 */

import { API_BASE } from '../config/api.js';

const BASE = API_BASE;
const TOKEN_KEY = 'millo_token';

function authHeaders() {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

/**
 * Send a behavior event to the backend for anti-bot / anomaly detection.
 * Fire-and-forget; does not throw. Call from video watch, like, scroll, etc.
 * @param {string} eventType - e.g. "video_watch", "like", "scroll"
 * @param {Object} [metadata] - e.g. { videoId }, { position }, { duration }
 */
export function trackBehavior(eventType, metadata = {}) {
  if (!eventType || typeof eventType !== 'string') return;
  fetch(`${BASE}/security/behavior`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      eventType,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
