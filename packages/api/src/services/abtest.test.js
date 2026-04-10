'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getVariant, getLikesWeightForVariant } = require('./abtest');
const { scoreVideo, rankFeed } = require('./ranking.service');

test('getVariant is A when A/B disabled', async (t) => {
  const prev = process.env.RANKING_AB_TEST_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.RANKING_AB_TEST_ENABLED;
    else process.env.RANKING_AB_TEST_ENABLED = prev;
  });
  delete process.env.RANKING_AB_TEST_ENABLED;
  assert.equal(getVariant('any-id'), 'A');
  assert.equal(getVariant(42), 'A');
});

test('getVariant stable A/B when enabled', async (t) => {
  const prev = process.env.RANKING_AB_TEST_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.RANKING_AB_TEST_ENABLED;
    else process.env.RANKING_AB_TEST_ENABLED = prev;
  });
  process.env.RANKING_AB_TEST_ENABLED = 'true';
  const id = '507f1f77bcf86cd799439011';
  assert.equal(getVariant(id), getVariant(id));
  assert.ok(getVariant(id) === 'A' || getVariant(id) === 'B');
});

test('getLikesWeightForVariant matches example arms', () => {
  assert.equal(getLikesWeightForVariant('A'), 3);
  assert.equal(getLikesWeightForVariant('B'), 5);
});

test('scoreVideo uses likes 3 vs 5 by variant', () => {
  const p = {};
  const v = { category: 'x', createdAt: new Date() };
  const s = { likes: 10, watchTime: 0 };
  const scoreA = scoreVideo(p, v, s, { variant: 'A' });
  const scoreB = scoreVideo(p, v, s, { variant: 'B' });
  assert.equal(scoreB - scoreA, 20);
});

test('rankFeed attaches abVariant; arm B scores higher on likes when A/B enabled', async (t) => {
  const prev = process.env.RANKING_AB_TEST_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.RANKING_AB_TEST_ENABLED;
    else process.env.RANKING_AB_TEST_ENABLED = prev;
  });
  process.env.RANKING_AB_TEST_ENABLED = 'true';
  let idA;
  let idB;
  for (let i = 0; i < 200; i++) {
    const id = `ab_${i}`;
    const v = getVariant(id);
    if (v === 'A' && !idA) idA = id;
    if (v === 'B' && !idB) idB = id;
    if (idA && idB) break;
  }
  assert.ok(idA && idB, 'find ids for both arms');
  const videos = [{ id: '1', category: 'c', createdAt: new Date() }];
  const signalsMap = { 1: { likes: 4, watchTime: 0 } };
  const outA = rankFeed({ _id: idA, profile: {} }, videos, signalsMap);
  const outB = rankFeed({ _id: idB, profile: {} }, videos, signalsMap);
  assert.equal(outA[0].abVariant, 'A');
  assert.equal(outB[0].abVariant, 'B');
  assert.ok(outB[0].score > outA[0].score);
});
