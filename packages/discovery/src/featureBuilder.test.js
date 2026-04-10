'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPairFeatures, contentAgeHours } = require('./featureBuilder');

const profile = {
  accountAgeDays: 10,
  avgSessionMinutes7d: 20,
  shortSkipRate7d: 0.1,
  likeRate7d: 0.2,
  shareRate7d: 0.05,
  language: 'en',
  country: 'US',
  creatorAffinityTop: ['creator1', '507f1f77bcf86cd799439011'],
  categoryAffinityTop: ['music', 'comedy'],
};

test('buildPairFeatures basic shape and pair signals', () => {
  const item = {
    creatorId: '507f1f77bcf86cd799439011',
    topics: ['music', 'sports'],
    language: 'en',
    region: 'US',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    durationSec: 60,
    ctr1h: 0.1,
    trustScore: 5,
  };
  const f = buildPairFeatures(profile, item);
  assert.equal(f.pair_follows_creator, 1);
  assert.equal(f.pair_topic_overlap, 1);
  assert.equal(f.pair_same_language, 1);
  assert.equal(f.pair_same_region, 1);
  assert.equal(f.creator_trust_score, 5);
  assert.ok(f.pair_age_hours >= 1 && f.pair_age_hours <= 3);
});

test('buildPairFeatures null profile uses zeros and no match', () => {
  const item = { creatorId: 'x', topics: [], createdAt: new Date() };
  const f = buildPairFeatures(null, item);
  assert.equal(f.user_account_age_days, 0);
  assert.equal(f.pair_follows_creator, 0);
  assert.equal(f.pair_topic_overlap, 0);
});

test('contentAgeHours missing createdAt', () => {
  assert.equal(contentAgeHours({}), 1);
});

test('buildPairFeatures session boosts from recentEvents', () => {
  const item = {
    contentId: 'x',
    creatorId: 'c',
    topics: ['cooking'],
    type: 'short',
    createdAt: new Date(),
  };
  const f = buildPairFeatures({}, item, {
    recentEvents: [
      { eventType: 'complete', topic: 'cooking' },
      { eventType: 'skip_fast', type: 'live' },
    ],
  });
  assert.equal(f.pair_session_topic_boost, 0.2);
  assert.equal(f.pair_session_type_penalty, 0);
  const flive = buildPairFeatures({}, { ...item, type: 'live' }, {
    recentEvents: [{ eventType: 'skip_fast', type: 'live' }],
  });
  assert.equal(flive.pair_session_type_penalty, -0.3);
});
