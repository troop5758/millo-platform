'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  creatorColdStartBoost,
  isUserColdStart,
  getColdStartExplorationRatio,
  isExploreCandidateRow,
} = require('./coldStart');

test('creatorColdStartBoost when fresh and low exposure', () => {
  const item = {
    createdAt: new Date(Date.now() - 2 * 3600000),
    ctr24h: 0.01,
    avgWatchTime24h: 1,
  };
  assert.equal(creatorColdStartBoost(item), 0.12);
});

test('creatorColdStartBoost zero when old', () => {
  const item = {
    createdAt: new Date(Date.now() - 48 * 3600000),
    ctr24h: 0.01,
    avgWatchTime24h: 1,
  };
  assert.equal(creatorColdStartBoost(item), 0);
});

test('isUserColdStart new account', () => {
  assert.equal(isUserColdStart({ accountAgeDays: 5 }), true);
  assert.equal(isUserColdStart({ accountAgeDays: 30, followsCount: 100 }), false);
});

test('getColdStartExplorationRatio', () => {
  assert.ok(getColdStartExplorationRatio({ accountAgeDays: 3 }) >= 0.3);
  assert.ok(getColdStartExplorationRatio({ accountAgeDays: 365, followsCount: 50 }) <= 0.2);
});

test('isExploreCandidateRow', () => {
  assert.equal(isExploreCandidateRow({ features: { pair_age_hours: 10 }, scores: {} }), true);
  assert.equal(isExploreCandidateRow({ features: { pair_age_hours: 100 }, scores: {} }), false);
});
