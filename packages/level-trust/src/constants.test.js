/**
 * Unit tests — constants. https://milloapp.com
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { xpRequiredForLevel, XP_PER_LEVEL, trustTierForScore, TRUST_TIERS } = require('./constants');

describe('constants', () => {
  it('xpRequiredForLevel(1) is 0', () => {
    assert.strictEqual(xpRequiredForLevel(1), 0);
  });
  it('xpRequiredForLevel(2) is 100', () => {
    assert.strictEqual(xpRequiredForLevel(2), 100);
  });
  it('xpRequiredForLevel(3) is 200', () => {
    assert.strictEqual(xpRequiredForLevel(3), 200);
  });
  it('XP_PER_LEVEL is 100', () => {
    assert.strictEqual(XP_PER_LEVEL, 100);
  });
  it('trustTierForScore(0) is new', () => {
    assert.strictEqual(trustTierForScore(0).name, 'new');
    assert.strictEqual(trustTierForScore(0).nextTierAt, 50);
  });
  it('trustTierForScore(50) is member', () => {
    assert.strictEqual(trustTierForScore(50).name, 'member');
    assert.strictEqual(trustTierForScore(50).nextTierAt, 200);
  });
  it('trustTierForScore(500) is veteran, nextTierAt null', () => {
    assert.strictEqual(trustTierForScore(500).name, 'veteran');
    assert.strictEqual(trustTierForScore(500).nextTierAt, null);
  });
  it('TRUST_TIERS has 4 tiers', () => {
    assert.strictEqual(TRUST_TIERS.length, 4);
  });
});
