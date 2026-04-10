'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sigmoid, scoreFeatures, rankByHeuristicFeatures, mergeFeedRankWeights } = require('./ranker');

test('sigmoid bounds', () => {
  assert.ok(sigmoid(0) > 0.49 && sigmoid(0) < 0.51);
  assert.ok(sigmoid(10) > 0.99);
  assert.ok(sigmoid(-10) < 0.01);
});

test('scoreFeatures returns all keys', () => {
  const f = {
    user_avg_session_minutes_7d: 30,
    user_short_skip_rate_7d: 0.1,
    item_completion_rate_24h: 0.5,
    item_avg_watch_time_24h: 60,
    pair_topic_overlap: 2,
    pair_same_language: 1,
    pair_follows_creator: 1,
    item_comment_rate_24h: 0.1,
    item_share_rate_24h: 0.05,
    item_ctr_24h: 0.02,
    item_follow_conversion_24h: 0.01,
    item_negative_rate_24h: 0.02,
    pair_age_hours: 10,
    creator_trust_score: 50,
  };
  const s = scoreFeatures(f);
  assert.equal(typeof s.pLongWatch, 'number');
  assert.equal(typeof s.finalScore, 'number');
  assert.ok(s.freshnessScore > 0.8);
  assert.equal(s.explorationBonus, 0.15);
});

test('scoreFeatures empty object is finite', () => {
  const s = scoreFeatures({});
  assert.ok(Number.isFinite(s.finalScore));
});

test('scoreFeatures weightOverrides changes finalScore vs defaults', () => {
  const f = {
    user_avg_session_minutes_7d: 20,
    user_short_skip_rate_7d: 0.2,
    item_completion_rate_24h: 0.4,
    item_avg_watch_time_24h: 40,
    pair_topic_overlap: 1,
    pair_same_language: 1,
    pair_follows_creator: 0,
    item_comment_rate_24h: 0.05,
    item_share_rate_24h: 0.03,
    item_ctr_24h: 0.01,
    item_follow_conversion_24h: 0.02,
    item_negative_rate_24h: 0.03,
    pair_age_hours: 20,
    creator_trust_score: 60,
  };
  const base = scoreFeatures(f);
  const boosted = scoreFeatures(f, { wLongWatch: 3 });
  assert.notEqual(boosted.finalScore, base.finalScore);
});

test('mergeFeedRankWeights fills defaults', () => {
  const defaults = mergeFeedRankWeights();
  const m = mergeFeedRankWeights({ wLike: 1 });
  assert.equal(m.wLike, 1);
  assert.equal(m.wLongWatch, defaults.wLongWatch);
});

test('rankByHeuristicFeatures sorts by finalScore', () => {
  const rows = [
    { item: { contentId: 'a' }, features: { pair_age_hours: 100 } },
    { item: { contentId: 'b' }, features: { pair_age_hours: 1, item_completion_rate_24h: 0.99, pair_same_language: 1 } },
  ];
  const out = rankByHeuristicFeatures(rows);
  assert.ok(out[0].scores.finalScore >= out[1].scores.finalScore);
});
