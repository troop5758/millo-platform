'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveLabels } = require('./rankTrainingLabels');

test('feed.engagement like → positive', () => {
  const d = deriveLabels('feed.engagement', { eventType: 'like', userId: 'u', contentId: 'c' });
  assert.equal(d.polarity, 'positive');
  assert.ok(d.labels.includes('positive_like'));
});

test('feed.negative report → negative', () => {
  const d = deriveLabels('feed.negative', { eventType: 'report', userId: 'u', contentId: 'c' });
  assert.equal(d.polarity, 'negative');
  assert.ok(d.labels.includes('negative_report'));
});

test('feed.watch watch_6s → positive', () => {
  const d = deriveLabels('feed.watch', { eventType: 'watch_6s', userId: 'u', contentId: 'c' });
  assert.ok(d.labels.includes('positive_watch_6s'));
});

test('feed.watch short watchTimeMs → skip under 2s', () => {
  const d = deriveLabels('feed.watch', { eventType: 'play', userId: 'u', contentId: 'c', watchTimeMs: 500 });
  assert.ok(d.labels.includes('negative_skip_under_2s'));
});

test('unknown event returns null', () => {
  assert.equal(deriveLabels('feed.watch', { eventType: 'impression' }), null);
});
