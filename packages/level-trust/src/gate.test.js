/**
 * Unit tests — gating (gateCore only, no DB). https://milloapp.com
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createGate } = require('./gateCore');

describe('gate', () => {
  it('checkLevel returns true when level >= minLevel', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 3, xp: 0 }),
      () => Promise.resolve(0)
    );
    const ok = await gate.checkLevel('user1', 2);
    assert.strictEqual(ok, true);
  });
  it('checkLevel returns false when level < minLevel', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(0)
    );
    const ok = await gate.checkLevel('user1', 2);
    assert.strictEqual(ok, false);
  });
  it('checkTrust returns true when trust >= minTrust', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(50)
    );
    const ok = await gate.checkTrust('user1', 10);
    assert.strictEqual(ok, true);
  });
  it('checkTrust returns false when trust < minTrust', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(5)
    );
    const ok = await gate.checkTrust('user1', 10);
    assert.strictEqual(ok, false);
  });
  it('requireLevel throws when gate fails', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(0)
    );
    await assert.rejects(() => gate.requireLevel('user1', 2), /LEVEL_GATE_FAILED/);
  });
  it('requireTrust throws when gate fails', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(1)
    );
    await assert.rejects(() => gate.requireTrust('user1', 10), /TRUST_GATE_FAILED/);
  });
  it('checkTrustTier returns true when tier >= minTier', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(0),
      () => Promise.resolve({ name: 'trusted', minScore: 200, nextTierAt: 500 })
    );
    const ok = await gate.checkTrustTier('user1', 'member');
    assert.strictEqual(ok, true);
  });
  it('checkTrustTier returns false when tier < minTier', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(0),
      () => Promise.resolve({ name: 'new', minScore: 0, nextTierAt: 50 })
    );
    const ok = await gate.checkTrustTier('user1', 'trusted');
    assert.strictEqual(ok, false);
  });
  it('requireTrustTier throws when gate fails', async () => {
    const gate = createGate(
      () => Promise.resolve({ level: 1, xp: 0 }),
      () => Promise.resolve(0),
      () => Promise.resolve({ name: 'new', minScore: 0, nextTierAt: 50 })
    );
    await assert.rejects(() => gate.requireTrustTier('user1', 'veteran'), /TRUST_TIER_GATE_FAILED/);
  });
});
