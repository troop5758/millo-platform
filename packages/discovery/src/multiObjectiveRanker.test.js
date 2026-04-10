'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeFinalFeedScore, MULTI_OBJECTIVE_WEIGHTS } = require('./multiObjectiveRanker');

test('computeFinalFeedScore matches documented formula (all zeros)', () => {
  const { finalScore, breakdown } = computeFinalFeedScore({});
  assert.equal(finalScore, 0);
  assert.equal(Object.values(breakdown).reduce((a, b) => a + b, 0), 0);
});

test('computeFinalFeedScore positive terms only', () => {
  const signals = {
    p_long_watch: 1,
    expected_watch_time: 1,
    p_like: 1,
    p_share: 1,
    p_follow: 1,
    p_gift_or_buy: 1,
    freshness_score: 1,
    exploration_bonus: 1,
  };
  const { finalScore } = computeFinalFeedScore(signals);
  const expected =
    1.2 + 0.9 + 0.65 + 0.55 + 0.75 + 1.1 + 0.4 + 0.25;
  assert.equal(finalScore, expected);
});

test('computeFinalFeedScore subtracts negative engagement', () => {
  const { finalScore } = computeFinalFeedScore({
    p_long_watch: 1,
    p_fast_skip: 1,
    p_report: 0.2,
    policy_risk_penalty: 0.5,
  });
  assert.equal(finalScore, 1.2 - 1.3 * 1 - 2.5 * 0.2 - 1.1 * 0.5);
});

test('custom weights override defaults', () => {
  const { finalScore } = computeFinalFeedScore({ p_like: 1 }, { p_like: 10 });
  assert.equal(finalScore, 10);
  assert.equal(MULTI_OBJECTIVE_WEIGHTS.p_like, 0.65);
});
