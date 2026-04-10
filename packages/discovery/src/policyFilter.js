'use strict';
/**
 * Trust + policy gates before ranking — applied after candidate generation.
 * https://milloapp.com
 */

const TRUST_SCORE_BLOCK_THRESHOLD = Number(process.env.DISCOVERY_TRUST_BLOCK_THRESHOLD) || -50;

/**
 * @typedef {object} PolicyFilterContext
 * @property {string[]} [blockedCreatorIds]
 * @property {string[]} [hiddenContentIds]
 * @property {string} [language] - User / session preferred language
 * @property {boolean} [allowMultilingual] - If false, drop content in another language
 */

function sid(v) {
  if (v == null) return '';
  return String(v);
}

function inList(list, id) {
  if (!list || !list.length) return false;
  const s = sid(id);
  for (const x of list) {
    if (sid(x) === s) return true;
  }
  return false;
}

/**
 * @param {object[]} candidates - e.g. ContentFeatures lean docs
 * @param {PolicyFilterContext} [context]
 * @returns {object[]}
 */
function filterCandidates(candidates, context = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const ctx = context || {};
  const blocked = ctx.blockedCreatorIds;
  const hidden = ctx.hiddenContentIds;
  const userLang = ctx.language && typeof ctx.language === 'string' ? ctx.language : null;
  const allowMultilingual = ctx.allowMultilingual === true;

  return candidates.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (item.moderationState !== 'approved') return false;
    if ((item.trustScore ?? 0) < TRUST_SCORE_BLOCK_THRESHOLD) return false;
    if (inList(blocked, item.creatorId)) return false;
    if (inList(hidden, item.contentId)) return false;
    if (userLang && item.language && item.language !== userLang) {
      if (!allowMultilingual) return false;
    }
    return true;
  });
}

module.exports = {
  filterCandidates,
  TRUST_SCORE_BLOCK_THRESHOLD,
};
