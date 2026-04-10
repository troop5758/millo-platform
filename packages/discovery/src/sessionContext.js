'use strict';
/**
 * Session-based ranking — TikTok-like intent: up-rank topics completed, down-rank types skipped.
 * Feed `recentEvents` (e.g. last N events in session) from client / Redis.
 * https://milloapp.com
 */

/**
 * @param {Array<{ eventType?: string, topic?: string, type?: string }>} [recentEvents]
 * @returns {{ topicBoosts: Record<string, number>, typeBoosts: Record<string, number> }}
 */
function deriveSessionBoosts(recentEvents = []) {
  const boosts = {
    topicBoosts: {},
    typeBoosts: {},
  };

  const list = Array.isArray(recentEvents) ? recentEvents : [];
  for (const ev of list) {
    const et = ev?.eventType ?? ev?.event ?? '';
    if (et === 'complete' && ev?.topic) {
      const t = String(ev.topic).trim();
      if (t) {
        boosts.topicBoosts[t] = (boosts.topicBoosts[t] || 0) + 0.2;
      }
    }
    if (et === 'skip_fast' && ev?.type) {
      const t = String(ev.type).trim();
      if (t) {
        boosts.typeBoosts[t] = (boosts.typeBoosts[t] || 0) - 0.3;
      }
    }
  }

  return boosts;
}

module.exports = {
  deriveSessionBoosts,
};
