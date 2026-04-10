const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { getRankingScoreBump } = require('./rankingOptimizer');

const KEYS = [
  'AI_OPTIMIZATION_ENABLED',
  'AI_SHADOW_MODE',
  'AI_RANKING_INJECTION_ENABLED',
  'AI_RANK_SCORE_WEIGHT',
  'NODE_ENV',
];

describe('getRankingScoreBump', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = {};
    KEYS.forEach((k) => {
      snapshot[k] = process.env[k];
    });
  });
  afterEach(() => {
    KEYS.forEach((k) => {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    });
  });

  it('returns heuristic * weight when injection on', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    process.env.AI_RANK_SCORE_WEIGHT = '0.3';
    const bump = getRankingScoreBump({ baseScore: 40, level: 2 });
    assert.ok(bump > 0 && bump <= 0.3);
  });

  it('returns explicit aiScore * weight', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    process.env.AI_RANK_SCORE_WEIGHT = '0.3';
    const bump = getRankingScoreBump({ baseScore: 0, level: 0, aiScore: 1 });
    assert.ok(Math.abs(bump - 0.3) < 1e-9);
  });

  it('returns 0 in shadow mode', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    process.env.AI_SHADOW_MODE = 'true';
    assert.strictEqual(getRankingScoreBump({ baseScore: 99, aiScore: 1 }), 0);
  });
});
