'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterCandidates, TRUST_SCORE_BLOCK_THRESHOLD } = require('./policyFilter');

test('filterCandidates keeps approved, trust ok', () => {
  const out = filterCandidates(
    [{ contentId: 'a', creatorId: 'c1', moderationState: 'approved', trustScore: 0, language: 'en' }],
    { language: 'en' }
  );
  assert.equal(out.length, 1);
});

test('filterCandidates drops non-approved', () => {
  const out = filterCandidates(
    [{ contentId: 'a', moderationState: 'pending', trustScore: 0 }],
    {}
  );
  assert.equal(out.length, 0);
});

test('filterCandidates drops low trust', () => {
  const out = filterCandidates(
    [{ contentId: 'a', moderationState: 'approved', trustScore: TRUST_SCORE_BLOCK_THRESHOLD - 1 }],
    {}
  );
  assert.equal(out.length, 0);
});

test('filterCandidates drops blocked creator', () => {
  const out = filterCandidates(
    [{ contentId: 'a', creatorId: 'bad', moderationState: 'approved', trustScore: 0 }],
    { blockedCreatorIds: ['bad'] }
  );
  assert.equal(out.length, 0);
});

test('filterCandidates drops hidden content', () => {
  const out = filterCandidates(
    [{ contentId: 'x', creatorId: 'c', moderationState: 'approved', trustScore: 0 }],
    { hiddenContentIds: ['x'] }
  );
  assert.equal(out.length, 0);
});

test('filterCandidates language gate', () => {
  const item = { contentId: 'a', creatorId: 'c', moderationState: 'approved', trustScore: 0, language: 'es' };
  assert.equal(filterCandidates([item], { language: 'en', allowMultilingual: false }).length, 0);
  assert.equal(filterCandidates([item], { language: 'en', allowMultilingual: true }).length, 1);
});

test('filterCandidates coerces id types for lists', () => {
  const out = filterCandidates(
    [{ contentId: '507f1f77bcf86cd799439011', creatorId: '507f1f77bcf86cd799439012', moderationState: 'approved', trustScore: 0 }],
    { blockedCreatorIds: [String('507f1f77bcf86cd799439012')] }
  );
  assert.equal(out.length, 0);
});
