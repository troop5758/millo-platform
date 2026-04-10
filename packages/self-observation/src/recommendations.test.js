/**
 * Validation: Recommendations visible; no auto-changes.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const obs = require('./index');

describe('Recommendations visible', () => {
  it('getRecommendations returns recommendations array', async () => {
    const out = await obs.getRecommendations({ checkMongo: false });
    assert.ok(Array.isArray(out.recommendations));
    assert.strictEqual(out.autoChange, false);
    out.recommendations.forEach((r) => {
      assert.ok(r.message);
      assert.strictEqual(r.autoChange, false);
    });
  });

  it('detectDrift returns recommendations and autoChange false', () => {
    const out = obs.detectDrift();
    assert.ok(Array.isArray(out.recommendations));
    assert.strictEqual(out.autoChange, false);
  });

  it('getUpgradeRecommendations returns recommendations and autoChange false', () => {
    const out = obs.getUpgradeRecommendations({ root: process.cwd() });
    assert.ok(Array.isArray(out.recommendations));
    assert.strictEqual(out.autoChange, false);
  });

  it('getSecurityAlerts returns alerts and autoChange false', () => {
    const out = obs.getSecurityAlerts({ root: process.cwd() });
    assert.ok(Array.isArray(out.alerts));
    assert.strictEqual(out.autoChange, false);
  });

  it('getHealthSummary returns status and autoChange false', () => {
    const out = obs.getHealthSummary();
    assert.ok(out.status);
    assert.strictEqual(out.autoChange, false);
  });
});
