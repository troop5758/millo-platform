const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { optimizeAdsCandidates } = require('./adsDeliveryOptimizer');

const KEYS = [
  'AI_OPTIMIZATION_ENABLED',
  'AI_SHADOW_MODE',
  'ADS_ENABLED',
  'AI_ADS_OPTIMIZATION_ENABLED',
  'NODE_ENV',
];

describe('optimizeAdsCandidates', () => {
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

  it('scales bids when optimization active', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    const c = [{ id: '1', bidCents: 100, campaignId: 'c1' }];
    const out = optimizeAdsCandidates(c, { hourUTC: 20, userCountry: 'US' });
    assert.ok(out[0].bidCents > 100);
    assert.ok(out[0].aiAdsOptimization);
    assert.strictEqual(out[0].aiAdsOptimization.timingBand, 'evening_peak');
  });

  it('passthrough when ADS_ENABLED=false', () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    process.env.ADS_ENABLED = 'false';
    const c = [{ id: '1', bidCents: 100 }];
    const out = optimizeAdsCandidates(c, { hourUTC: 20 });
    assert.strictEqual(out[0].bidCents, 100);
  });
});
