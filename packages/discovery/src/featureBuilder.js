'use strict';
/**
 * Pairwise user × content feature vector for Ranker A/B (GBDT / linear / export to training).
 * Context.recentEvents or context.sessionBoosts enable session-based boosts (see sessionContext).
 * https://milloapp.com
 */
const { deriveSessionBoosts } = require('./sessionContext');
const { creatorColdStartBoost, isUserColdStart } = require('./coldStart');

function sid(v) {
  if (v == null) return '';
  return String(v);
}

function listIncludesId(list, id) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const s = sid(id);
  return list.some((x) => sid(x) === s);
}

/**
 * Age of content in hours (minimum 1). Uses item.createdAt; invalid/missing → 1.
 * @param {object} item
 * @returns {number}
 */
function contentAgeHours(item) {
  const raw = item?.createdAt;
  if (!raw) return 1;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 1;
  const hours = (Date.now() - t) / (1000 * 60 * 60);
  return Math.max(1, hours);
}

/**
 * @param {object|null|undefined} userProfile - UserProfileFeatures lean doc
 * @param {object} item - ContentFeatures lean doc (or compatible)
 * @param {object} [context] - { recentEvents?, sessionBoosts?, position? } — session boosts from deriveSessionBoosts
 * @returns {Record<string, number>}
 */
function buildPairFeatures(userProfile, item, context = {}) {
  const ctx = context && typeof context === 'object' ? context : {};
  const u = userProfile && typeof userProfile === 'object' ? userProfile : {};

  const sessionBoosts =
    ctx.sessionBoosts && typeof ctx.sessionBoosts === 'object'
      ? ctx.sessionBoosts
      : deriveSessionBoosts(ctx.recentEvents || []);

  const itemTopics = item?.topics || [];
  const dominantTopic = Array.isArray(itemTopics) && itemTopics[0] ? String(itemTopics[0]).trim() : null;
  const itemType = item?.type != null ? String(item.type).trim() : null;

  let pair_session_topic_boost = 0;
  if (dominantTopic && sessionBoosts.topicBoosts[dominantTopic] != null) {
    pair_session_topic_boost = Number(sessionBoosts.topicBoosts[dominantTopic]) || 0;
  }

  let pair_session_type_penalty = 0;
  if (itemType && sessionBoosts.typeBoosts[itemType] != null) {
    pair_session_type_penalty = Number(sessionBoosts.typeBoosts[itemType]) || 0;
  }

  const followsCreator = listIncludesId(u.creatorAffinityTop, item?.creatorId) ? 1 : 0;
  const userTopics = u.categoryAffinityTop || [];
  const topicOverlap = Array.isArray(itemTopics)
    ? itemTopics.filter((t) => listIncludesId(userTopics, t)).length
    : 0;

  const ageHours = contentAgeHours(item);

  return {
    user_account_age_days: Number(u.accountAgeDays) || 0,
    user_avg_session_minutes_7d: Number(u.avgSessionMinutes7d) || 0,
    user_short_skip_rate_7d: Number(u.shortSkipRate7d) || 0,
    user_like_rate_7d: Number(u.likeRate7d) || 0,
    user_share_rate_7d: Number(u.shareRate7d) || 0,

    item_duration_sec: Number(item?.durationSec) || 0,
    item_ctr_1h: Number(item?.ctr1h) || 0,
    item_ctr_24h: Number(item?.ctr24h) || 0,
    item_avg_watch_time_1h: Number(item?.avgWatchTime1h) || 0,
    item_avg_watch_time_24h: Number(item?.avgWatchTime24h) || 0,
    item_completion_rate_24h: Number(item?.completionRate24h) || 0,
    item_share_rate_24h: Number(item?.shareRate24h) || 0,
    item_comment_rate_24h: Number(item?.commentRate24h) || 0,
    item_follow_conversion_24h: Number(item?.followConversion24h) || 0,
    item_negative_rate_24h: Number(item?.negativeRate24h) || 0,

    pair_follows_creator: followsCreator,
    pair_topic_overlap: topicOverlap,
    pair_age_hours: ageHours,
    pair_same_language: u.language && item?.language && u.language === item.language ? 1 : 0,
    pair_same_region: u.country && item?.region && u.country === item.region ? 1 : 0,

    creator_trust_score: Number(item?.trustScore) || 0,

    pair_session_topic_boost,
    pair_session_type_penalty,

    pair_creator_cold_start_boost: creatorColdStartBoost(item),
    pair_user_cold_start: isUserColdStart(u) ? 1 : 0,
  };
}

module.exports = {
  buildPairFeatures,
  contentAgeHours,
};
