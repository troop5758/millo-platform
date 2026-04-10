'use strict';
/**
 * Redis keys for Kafka-driven discovery ranking (written by discoveryKafkaRanking worker).
 * Score: views*0.3 + likes*0.5 + watchTime*0.2
 * https://milloapp.com
 */
const { getRedis } = require('./rateLimitRedisStore');

const METRICS_PREFIX = 'discovery:rank:metrics:';
const SCORE_PREFIX = 'discovery:rank:score:';

const W_VIEWS = 0.3;
const W_LIKES = 0.5;
const W_WATCH = 0.2;

function metricsKey(contentId) {
  return `${METRICS_PREFIX}${contentId}`;
}

function scoreKey(contentId) {
  return `${SCORE_PREFIX}${contentId}`;
}

function computeRankScore(views, likes, watchTime) {
  const v = Number(views) || 0;
  const l = Number(likes) || 0;
  const w = Number(watchTime) || 0;
  return v * W_VIEWS + l * W_LIKES + w * W_WATCH;
}

/**
 * Increment metrics and persist aggregate score (used by Kafka worker).
 */
async function incrementAndScore(contentId, { views = 0, likes = 0, watchTime = 0 } = {}) {
  if (!contentId || (!views && !likes && !watchTime)) return null;
  const r = getRedis();
  const mk = metricsKey(String(contentId));
  const pipe = r.pipeline();
  if (views) pipe.hincrby(mk, 'views', views);
  if (likes) pipe.hincrby(mk, 'likes', likes);
  if (watchTime) pipe.hincrby(mk, 'watchTime', watchTime);
  await pipe.exec();
  const h = await r.hgetall(mk);
  const score = computeRankScore(h.views, h.likes, h.watchTime);
  await r.set(scoreKey(String(contentId)), String(score));
  return {
    views: Number(h.views || 0),
    likes: Number(h.likes || 0),
    watchTime: Number(h.watchTime || 0),
    score,
  };
}

module.exports = {
  incrementAndScore,
  computeRankScore,
  scoreKey,
  metricsKey,
  W_VIEWS,
  W_LIKES,
  W_WATCH,
};
