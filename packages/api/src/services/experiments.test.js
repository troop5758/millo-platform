'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getExperimentBucket,
  getRankWeightOverridesForBucket,
  getFeedRankExperimentContext,
} = require('./experiments');

test('getExperimentBucket is stable and v1/v2 only', () => {
  const a = getExperimentBucket('507f1f77bcf86cd799439011');
  const b = getExperimentBucket('507f1f77bcf86cd799439011');
  assert.equal(a, b);
  assert.ok(a === 'rank_v1' || a === 'rank_v2');
});

test('getRankWeightOverridesForBucket rank_v2 returns partial weights', () => {
  const o = getRankWeightOverridesForBucket('rank_v2');
  assert.ok(o && typeof o.wLongWatch === 'number');
  assert.equal(getRankWeightOverridesForBucket('rank_v1'), undefined);
  assert.equal(getRankWeightOverridesForBucket('control'), undefined);
});

test('getFeedRankExperimentContext control when A/B disabled', async (t) => {
  const prev = process.env.FEED_RANK_AB_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.FEED_RANK_AB_ENABLED;
    else process.env.FEED_RANK_AB_ENABLED = prev;
  });
  delete process.env.FEED_RANK_AB_ENABLED;
  const ctx = getFeedRankExperimentContext('user1');
  assert.equal(ctx.experimentBucket, 'control');
  assert.equal(ctx.rankWeightOverrides, undefined);
});

test('getFeedRankExperimentContext splits when enabled', async (t) => {
  const prev = process.env.FEED_RANK_AB_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.FEED_RANK_AB_ENABLED;
    else process.env.FEED_RANK_AB_ENABLED = prev;
  });
  process.env.FEED_RANK_AB_ENABLED = 'true';
  const ctx = getFeedRankExperimentContext('507f1f77bcf86cd799439011');
  assert.ok(ctx.experimentBucket === 'rank_v1' || ctx.experimentBucket === 'rank_v2');
  if (ctx.experimentBucket === 'rank_v2') assert.ok(ctx.rankWeightOverrides);
  else assert.equal(ctx.rankWeightOverrides, undefined);
});
