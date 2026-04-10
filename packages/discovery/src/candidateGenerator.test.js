'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { followsRedisKey, TRENDING_CACHE_KEY } = require('./candidateGenerator');

test('followsRedisKey matches pipeline contract', () => {
  assert.equal(followsRedisKey('507f1f77bcf86cd799439011'), 'u:507f1f77bcf86cd799439011:follows');
});

test('trending cache key', () => {
  assert.equal(TRENDING_CACHE_KEY, 'feed:trending:candidates');
});
