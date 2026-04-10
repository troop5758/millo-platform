'use strict';
/**
 * User profile vectors — aggregate interest weights from behavioral events (e.g. watch time by category).
 * Feed into discovery `UserProfileFeatures.categoryAffinityTop` or ranking features downstream.
 * https://milloapp.com
 */

/**
 * @param {Array<{ category?: string, watchTime?: number }>} events
 * @returns {Record<string, number>} category → accumulated watch seconds (or count fallback)
 */
function buildUserProfile(events) {
  const profile = Object.create(null);
  if (!Array.isArray(events)) {
    return profile;
  }

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const raw = e.category != null ? String(e.category).trim() : '';
    if (!raw) continue;
    const category = raw.toLowerCase();
    if (!profile[category]) {
      profile[category] = 0;
    }
    const w = Number(e.watchTime);
    profile[category] += Number.isFinite(w) && w > 0 ? w : 1;
  }

  return profile;
}

module.exports = {
  buildUserProfile,
};
