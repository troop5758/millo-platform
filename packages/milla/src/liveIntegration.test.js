/**
 * Phase 5.6 validation: Force mute works, kill-switch works.
 * https://milloapp.com
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const voiceHooks = require(path.join(__dirname, 'voiceHooks.js'));
const liveIntegration = require(path.join(__dirname, 'liveIntegration.js'));
const giftReactions = require(path.join(__dirname, 'giftReactions.js'));
const policyEngine = require(path.join(__dirname, 'policyEngine.js'));

describe('force mute', () => {
  beforeEach(() => {
    voiceHooks.clearHooks();
    giftReactions.clearReactionLog();
    liveIntegration.forceUnmute('s1');
    policyEngine.setPolicy({ giftReaction: true, voiceOut: true });
  });

  it('when muted, voice out is not emitted (force mute works)', () => {
    let emitted = false;
    voiceHooks.registerHook('out', () => { emitted = true; });
    liveIntegration.forceMute('s1');
    voiceHooks.emitHook('out', { streamId: 's1', content: 'hi' });
    assert.strictEqual(emitted, false);
  });

  it('when unmuted, voice out is emitted', () => {
    let emitted = false;
    voiceHooks.registerHook('out', () => { emitted = true; });
    voiceHooks.emitHook('out', { streamId: 's1', content: 'hi' });
    assert.strictEqual(emitted, true);
  });
});

describe('kill-switch', () => {
  beforeEach(() => {
    giftReactions.clearReactionLog();
    liveIntegration.forceUnmute('s1');
    liveIntegration.setCoHost('s1', true);
    policyEngine.setPolicy({ giftReaction: true });
    delete process.env.MILLA_ENABLED;
  });

  it('when MILLA_ENABLED=false, onGift returns null (kill-switch works)', async () => {
    process.env.MILLA_ENABLED = 'false';
    const result = await liveIntegration.onGift('s1', { id: 'g1' });
    assert.strictEqual(result, null);
    assert.strictEqual(giftReactions.getReactionLog().length, 0);
  });

  it('when MILLA_ENABLED not set, onGift reacts', async () => {
    process.env.MILLA_ENABLED = 'true';
    const result = await liveIntegration.onGift('s1', { id: 'g1' });
    assert.ok(result && result.type === 'gift_reaction');
    assert.strictEqual(giftReactions.getReactionLog().length, 1);
  });
});
