'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diversifyAndCap } = require('./postRanker');

test('diversifyAndCap respects maxPerCreator', () => {
  const items = [
    { item: { creatorId: 'c1', topics: ['a'] }, scores: { finalScore: 10 } },
    { item: { creatorId: 'c1', topics: ['a'] }, scores: { finalScore: 9 } },
    { item: { creatorId: 'c1', topics: ['b'] }, scores: { finalScore: 8 } },
    { item: { creatorId: 'c2', topics: ['a'] }, scores: { finalScore: 7 } },
  ];
  const out = diversifyAndCap(items, { maxPerCreator: 2, limit: 10 });
  const c1Count = out.filter((r) => String(r.item.creatorId) === 'c1').length;
  assert.equal(c1Count, 2);
  assert.ok(out.some((r) => r.item.creatorId === 'c2'));
});

test('diversifyAndCap respects maxPerTopic', () => {
  const items = [
    { item: { creatorId: 'c1', topics: ['music'] }, scores: { finalScore: 10 } },
    { item: { creatorId: 'c2', topics: ['music'] }, scores: { finalScore: 9 } },
    { item: { creatorId: 'c3', topics: ['music'] }, scores: { finalScore: 8 } },
    { item: { creatorId: 'c4', topics: ['comedy'] }, scores: { finalScore: 7 } },
  ];
  const out = diversifyAndCap(items, { maxPerTopic: 2, limit: 10 });
  const musicCount = out.filter((r) => r.item.topics?.[0] === 'music').length;
  assert.equal(musicCount, 2);
});
