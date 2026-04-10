const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const config = require('./config');

const KEYS = [
  'AI_OPTIMIZATION_ENABLED',
  'AI_SHADOW_MODE',
  'AI_RANKING_INJECTION_ENABLED',
  'ADS_ENABLED',
  'AI_ADS_OPTIMIZATION_ENABLED',
  'AI_RANK_SCORE_WEIGHT',
  'NODE_ENV',
];

describe('AI optimization config', () => {
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

  it('getAiOptimizationEnabled defaults true in production when unset', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    assert.strictEqual(config.getAiOptimizationEnabled(), true);
  });

  it('getAiOptimizationEnabled false in production when explicitly false', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    process.env.AI_OPTIMIZATION_ENABLED = 'false';
    assert.strictEqual(config.getAiOptimizationEnabled(), false);
  });

  it('getAiOptimizationEnabled false in dev when unset', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'test';
    assert.strictEqual(config.getAiOptimizationEnabled(), false);
    process.env.AI_OPTIMIZATION_ENABLED = 'true';
    assert.strictEqual(config.getAiOptimizationEnabled(), true);
  });

  it('shouldApplyRankingInjection respects shadow and per-feature kill', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    assert.strictEqual(config.shouldApplyRankingInjection(), true);
    process.env.AI_SHADOW_MODE = 'true';
    assert.strictEqual(config.shouldApplyRankingInjection(), false);
    delete process.env.AI_SHADOW_MODE;
    process.env.AI_RANKING_INJECTION_ENABLED = 'false';
    assert.strictEqual(config.shouldApplyRankingInjection(), false);
  });

  it('shouldApplyAdsOptimization requires ads and AI ads flag', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    assert.strictEqual(config.shouldApplyAdsOptimization(), true);
    process.env.ADS_ENABLED = 'false';
    assert.strictEqual(config.shouldApplyAdsOptimization(), false);
    delete process.env.ADS_ENABLED;
    process.env.AI_ADS_OPTIMIZATION_ENABLED = 'false';
    assert.strictEqual(config.shouldApplyAdsOptimization(), false);
  });
});
