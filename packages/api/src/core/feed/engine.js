'use strict';
/**
 * Feed guarantee engine — ranked slate, trending fallback when empty, fully hydrated items only.
 * Wraps @millo/discovery `buildForYouFeed` + `discoveryService.getFeed('trending')` and
 * `finalizeFeedOrganicItems` (hydration, completeness filter, placeholder guarantee).
 * https://milloapp.com
 */

const { feedService, discoveryService } = require('@millo/discovery');
const {
  isCompleteFeedItem,
  finalizeFeedOrganicItems,
  trendingRowToFeedItem,
} = require('../../services/feedItemHydration.service');

const isFullyHydrated = isCompleteFeedItem;

/**
 * @param {unknown} user
 * @returns {string|null}
 */
function extractUserId(user) {
  if (user == null) return null;
  if (typeof user === 'string' || typeof user === 'number') return String(user).trim() || null;
  const id = user._id ?? user.id;
  if (id != null) return String(id);
  return null;
}

/**
 * @param {object[]} items
 */
function mapSkeletalToFeedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    if (!it || typeof it !== 'object') return it;
    return {
      ...it,
      contentId: it.contentId != null ? String(it.contentId) : '',
      creatorId: it.creatorId != null ? String(it.creatorId) : null,
    };
  });
}

/**
 * Discovery-ranked skeletal items (For You). Empty on error or cold profile with no candidates.
 * @param {unknown} user
 * @param {{
 *   limit?: number,
 *   offset?: number,
 *   context?: object,
 *   observe?: function,
 * }} [opts]
 * @returns {Promise<object[]>}
 */
async function getRankedContent(user, opts = {}) {
  const userId = extractUserId(user);
  if (!userId) return [];
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  try {
    const result = await feedService.buildForYouFeed({
      userId,
      context: opts.context && typeof opts.context === 'object' ? opts.context : {},
      limit,
      offset,
      observe: opts.observe,
    });
    return mapSkeletalToFeedItems(result?.items ?? []);
  } catch {
    return [];
  }
}

/**
 * Trending skeletal feed items when ranking yields no rows.
 * @param {unknown} _user
 * @param {{
 *   limit?: number,
 *   offset?: number,
 *   region?: object,
 *   contentFilter?: object,
 *   blockedCreatorIds?: string[],
 * }} [opts]
 * @returns {Promise<object[]>}
 */
async function getTrending(_user, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const blocked = new Set((opts.blockedCreatorIds || []).map(String));
  let rows = [];
  try {
    rows = await discoveryService.getFeed('trending', {
      userId: null,
      limit: Math.min(50, limit * 2),
      offset,
      region: opts.region && typeof opts.region === 'object' ? opts.region : {},
      contentFilter:
        opts.contentFilter && typeof opts.contentFilter === 'object' ? opts.contentFilter : {},
    });
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out = [];
  let r = 1;
  for (const row of rows) {
    if (out.length >= limit) break;
    const cid = String(row.id != null ? row.id : '');
    if (!cid) continue;
    if (row.creatorId && blocked.has(String(row.creatorId))) continue;
    out.push(trendingRowToFeedItem(row, r));
    r += 1;
  }
  return out;
}

/**
 * @param {unknown} user — session user or `{ _id }` / string userId
 * @param {{
 *   limit?: number,
 *   offset?: number,
 *   context?: object,
 *   observe?: function,
 *   blockedCreatorIds?: string[],
 *   hasMore?: boolean,
 *   contentFilter?: object,
 *   region?: object,
 * }} [opts]
 * @returns {Promise<object[]>}
 */
async function buildFeed(user, opts = {}) {
  const userId = extractUserId(user);
  if (!userId) {
    const err = new Error('FEED_USER_REQUIRED');
    err.code = 'FEED_USER_REQUIRED';
    throw err;
  }

  let items = await getRankedContent(user, opts);
  if (!items.length) {
    items = await getTrending(user, opts);
  }

  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));

  const fin = await finalizeFeedOrganicItems(items, {
    limit,
    blockedCreatorIds: opts.blockedCreatorIds || [],
    hasMore: opts.hasMore ?? false,
    contentFilter: opts.contentFilter && typeof opts.contentFilter === 'object' ? opts.contentFilter : {},
    region: opts.region && typeof opts.region === 'object' ? opts.region : {},
    feedPageOffset: offset,
    allowTrendingWhenEmpty: true,
  });

  return fin.items.filter(isFullyHydrated);
}

module.exports = {
  buildFeed,
  getRankedContent,
  getTrending,
  isFullyHydrated,
  extractUserId,
};
