'use strict';
/**
 * Phase 7 — Discovery Service. Orchestrates feed generation by type.
 * https://milloapp.com
 */
const feedGenerator = require('./feedGenerator');

const FEED_TYPES = ['global', 'regional', 'following', 'trending', 'shopping', 'shorts'];

/**
 * Get feed by type.
 * @param {object} options.contentFilter - Phase 9: MongoDB query fragment to filter by contentCategory (e.g. { contentCategory: { $nin: ['mature','explicit'] } })
 */
async function getFeed(feedType, options = {}) {
  const { userId, limit = 20, offset = 0, region = {}, contentFilter = {} } = options;
  const lim = Math.min(Number(limit) || 20, 50);
  const off = Math.max(0, Number(offset) || 0);
  if (!FEED_TYPES.includes(feedType)) {
    throw new Error('INVALID_FEED_TYPE');
  }
  if (feedType === 'shopping') {
    return feedGenerator.generateShoppingFeed(lim, off, region, contentFilter);
  }
  if (feedType === 'following') {
    return feedGenerator.generateFollowingFeed(userId, lim, off, region, contentFilter);
  }
  if (feedType === 'regional') {
    return feedGenerator.generateRegionalFeed(lim, off, region, contentFilter);
  }
  if (feedType === 'trending') {
    return feedGenerator.generateTrendingFeed(lim, off, region, contentFilter);
  }
  if (feedType === 'shorts') {
    return feedGenerator.generateShortsFeed(lim, off, region, contentFilter);
  }
  return feedGenerator.generateGlobalFeed(lim, off, region, contentFilter);
}

/**
 * Get available feed types.
 */
function getFeedTypes() {
  return [...FEED_TYPES];
}

module.exports = { getFeed, getFeedTypes, FEED_TYPES };
