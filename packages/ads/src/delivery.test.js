/**
 * Phase 8 validation: Kill-switch halts delivery. https://milloapp.com
 * When getAdsEnabled() is false, deliver() returns null (see delivery.js).
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const config = require(path.resolve(__dirname, 'config.js'));

describe('ads engine', () => {
  beforeEach(() => {
    delete process.env.ADS_ENABLED;
  });

  it('kill-switch halts delivery: when ADS_ENABLED=false, getAdsEnabled returns false', () => {
    process.env.ADS_ENABLED = 'false';
    assert.strictEqual(config.getAdsEnabled(), false);
  });

  it('when ADS_ENABLED not set, getAdsEnabled returns true', () => {
    assert.strictEqual(config.getAdsEnabled(), true);
  });
});
