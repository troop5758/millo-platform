/**
 * Phase 7 validation: Shadow ban respected. Deterministic ranking, explainability.
 * https://milloapp.com
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const discovery = require(path.resolve(__dirname, 'index.js'));

describe('discovery engine', () => {
  it('shadow ban respected: shadowBanned items excluded from results', () => {
    const items = [
      { id: '1', baseScore: 10, level: 2 },
      { id: '2', baseScore: 20, level: 1, shadowBanned: true },
      { id: '3', baseScore: 5, level: 3 },
    ];
    const ranked = discovery.rank(items);
    assert.strictEqual(ranked.length, 2);
    assert.ok(ranked.every((r) => !r.shadowBanned));
    const ids = ranked.map((r) => r.id);
    assert.ok(ids.includes('1'));
    assert.ok(ids.includes('3'));
    assert.ok(!ids.includes('2'));
  });

  it('deterministic: same inputs produce same order', () => {
    const items = [
      { id: 'a', baseScore: 1, level: 1 },
      { id: 'b', baseScore: 1, level: 2 },
      { id: 'c', baseScore: 1, level: 0 },
    ];
    const r1 = discovery.rank(items);
    const r2 = discovery.rank(items);
    assert.deepStrictEqual(r1.map((x) => x.id), r2.map((x) => x.id));
  });

  it('level weighting: higher level ranks higher when baseScore equal', () => {
    const items = [
      { id: 'low', baseScore: 0, level: 1 },
      { id: 'high', baseScore: 0, level: 5 },
    ];
    const ranked = discovery.rank(items);
    assert.strictEqual(ranked[0].id, 'high');
    assert.strictEqual(ranked[1].id, 'low');
  });

  it('rankWithExplanation includes explanation per item', () => {
    const items = [
      { id: '1', baseScore: 10, level: 2 },
      { id: '2', baseScore: 5, level: 3, shadowBanned: true },
    ];
    const ranked = discovery.rankWithExplanation(items);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].id, '1');
    assert.ok(ranked[0].explanation);
    assert.strictEqual(ranked[0].explanation.level, 2);
    assert.strictEqual(ranked[0].explanation.shadowBanned, false);
  });

  it('trust weighting: higher trust ranks higher when baseScore and level equal', () => {
    const items = [
      { id: 'low', baseScore: 0, level: 1, trust: 10 },
      { id: 'high', baseScore: 0, level: 1, trust: 50 },
    ];
    const ranked = discovery.rank(items);
    assert.strictEqual(ranked[0].id, 'high');
    assert.strictEqual(ranked[1].id, 'low');
  });

  it('rankWithExplanation includes trust in explanation when item has trust', () => {
    const items = [{ id: '1', baseScore: 0, level: 1, trust: 20 }];
    const ranked = discovery.rankWithExplanation(items);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].explanation.trust, 20);
    assert.ok(typeof ranked[0].explanation.trustWeight === 'number');
    assert.ok(typeof ranked[0].explanation.trustContribution === 'number');
  });

  it('rankShorts and rankLive return same order as rank', () => {
    const items = [
      { id: 'a', baseScore: 1, level: 2 },
      { id: 'b', baseScore: 2, level: 1 },
    ];
    const r = discovery.rank(items);
    const rShorts = discovery.rankShorts(items);
    const rLive = discovery.rankLive(items);
    assert.deepStrictEqual(r.map((x) => x.id), rShorts.map((x) => x.id));
    assert.deepStrictEqual(r.map((x) => x.id), rLive.map((x) => x.id));
  });

  it('rankShortsWithExplanation includes source shorts in explanation', () => {
    const items = [{ id: '1', baseScore: 0, level: 1 }];
    const ranked = discovery.rankShortsWithExplanation(items);
    assert.strictEqual(ranked[0].explanation.source, 'shorts');
  });

  it('rankLiveWithExplanation includes source live in explanation', () => {
    const items = [{ id: '1', baseScore: 0, level: 1 }];
    const ranked = discovery.rankLiveWithExplanation(items);
    assert.strictEqual(ranked[0].explanation.source, 'live');
  });
});
