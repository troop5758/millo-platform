'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nearestContentByUserEmbedding,
  registerVectorRetrievalBackend,
  buildStubEmbeddingFromProfile,
} = require('./vectorRetrieval');

test('nearestContentByUserEmbedding returns [] without backend', async () => {
  registerVectorRetrievalBackend(null);
  const out = await nearestContentByUserEmbedding([0.1, 0.2], 10);
  assert.deepEqual(out, []);
});

test('nearestContentByUserEmbedding uses registered backend', async () => {
  registerVectorRetrievalBackend({
    nearestByEmbedding: async (vec, limit) => [{ contentId: 'x', score: 1, vector: vec, limit }],
  });
  const out = await nearestContentByUserEmbedding([1], 5);
  assert.equal(out.length, 1);
  assert.equal(out[0].contentId, 'x');
  registerVectorRetrievalBackend(null);
});

test('buildStubEmbeddingFromProfile has fixed dim', () => {
  const v = buildStubEmbeddingFromProfile(
    { categoryAffinityTop: ['a'], creatorAffinityTop: ['b'], language: 'en', country: 'US' },
    64
  );
  assert.equal(v.length, 64);
});
