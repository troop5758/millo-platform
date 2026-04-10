'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveSessionBoosts } = require('./sessionContext');

test('deriveSessionBoosts complete boosts topic', () => {
  const b = deriveSessionBoosts([
    { eventType: 'complete', topic: 'cooking' },
    { eventType: 'complete', topic: 'cooking' },
  ]);
  assert.equal(b.topicBoosts.cooking, 0.4);
});

test('deriveSessionBoosts skip_fast penalizes type', () => {
  const b = deriveSessionBoosts([
    { eventType: 'skip_fast', type: 'live' },
    { eventType: 'skip_fast', type: 'live' },
  ]);
  assert.equal(b.typeBoosts.live, -0.6);
});
