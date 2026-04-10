/**
 * Validation: No auto-application. Suggestions have applied: false; package never calls discovery/ads.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const optimization = require('./index');

describe('No auto-application', () => {
  it('suggestRanking never returns applied: true', () => {
    process.env.AI_OPTIMIZATION_ENABLED = 'true';
    const out = optimization.suggestRanking([{ id: '1', level: 1, baseScore: 10 }]);
    assert.strictEqual(out.applied, false);
    assert.strictEqual(out.shadowMode, true);
    assert.ok(out.explanation);
    assert.strictEqual(out.explanation.applied, false);
    delete process.env.AI_OPTIMIZATION_ENABLED;
  });
  it('suggestRanking when kill-switch returns applied: false and disabled: true', () => {
    process.env.AI_OPTIMIZATION_ENABLED = 'false';
    const out = optimization.suggestRanking([{ id: '1' }]);
    assert.strictEqual(out.applied, false);
    assert.strictEqual(out.disabled, true);
    delete process.env.AI_OPTIMIZATION_ENABLED;
  });
  it('suggestBid never returns applied: true', () => {
    process.env.AI_OPTIMIZATION_ENABLED = 'true';
    const out = optimization.suggestBid([{ id: 'a', bidCents: 100 }]);
    assert.strictEqual(out.applied, false);
    assert.strictEqual(out.shadowMode, true);
    assert.ok(out.explanation);
    assert.strictEqual(out.explanation.applied, false);
    delete process.env.AI_OPTIMIZATION_ENABLED;
  });
  it('suggestBid when kill-switch returns applied: false and disabled: true', () => {
    process.env.AI_OPTIMIZATION_ENABLED = 'false';
    const out = optimization.suggestBid([{ id: 'a', bidCents: 50 }]);
    assert.strictEqual(out.applied, false);
    assert.strictEqual(out.disabled, true);
    delete process.env.AI_OPTIMIZATION_ENABLED;
  });
});
