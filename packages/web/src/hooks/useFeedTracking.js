import { useCallback, useRef } from 'react';
import {
  fetchDiscoveryForYou,
  trackFeedImpression,
  trackFeedWatch,
  trackFeedEngagement,
  trackFeedNegative,
} from '../sdk/contentApi';

/**
 * Session events for discovery ranking (`deriveSessionBoosts` on API).
 * Shape matches `GET /feed/for-you` header `X-Session-Events` (JSON array).
 * https://milloapp.com
 */

const MAX_EVENTS = 100;

/**
 * @returns {{
 *   pushFeedEvent: (e: { eventType?: string, topic?: string, type?: string }) => void,
 *   getRecentSessionEvents: () => Array<{ eventType?: string, topic?: string, type?: string }>,
 *   clearSessionEvents: () => void,
 *   fetchDiscoveryForYou: (limit?: number) => Promise<{ items?: unknown[] }>,
 * }}
 */
export function useFeedTracking() {
  const eventsRef = useRef([]);

  const pushFeedEvent = useCallback((e) => {
    if (!e || typeof e !== 'object') return;
    const row = {
      eventType: e.eventType != null ? String(e.eventType) : undefined,
      topic: e.topic != null ? String(e.topic) : undefined,
      type: e.type != null ? String(e.type) : undefined,
    };
    const prev = eventsRef.current;
    eventsRef.current = [...prev.slice(-(MAX_EVENTS - 1)), row];
  }, []);

  const getRecentSessionEvents = useCallback(() => eventsRef.current, []);

  const clearSessionEvents = useCallback(() => {
    eventsRef.current = [];
  }, []);

  const loadDiscoveryForYou = useCallback(async (limit = 20) => {
    return fetchDiscoveryForYou(limit, { recentEvents: eventsRef.current });
  }, []);

  return {
    pushFeedEvent,
    getRecentSessionEvents,
    clearSessionEvents,
    fetchDiscoveryForYou: loadDiscoveryForYou,
  };
}

/** Fire-and-forget API trackers (reference pack parity). Errors swallowed. */
export async function trackImpression(payload) {
  try {
    await trackFeedImpression(payload);
  } catch {
    /* offline / 401 */
  }
}
export async function trackWatch(payload) {
  try {
    await trackFeedWatch(payload);
  } catch {
    /* offline / 401 */
  }
}
export async function trackEngagement(payload) {
  try {
    await trackFeedEngagement(payload);
  } catch {
    /* offline / 401 */
  }
}
export async function trackNegative(payload) {
  try {
    await trackFeedNegative(payload);
  } catch {
    /* offline / 401 */
  }
}
