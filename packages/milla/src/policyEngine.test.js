/**
 * Policy gating verified — MILLA NEVER acts without policy approval.
 * https://milloapp.com
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const policyEngine = require(path.join(__dirname, 'policyEngine.js'));
const giftReactions = require(path.join(__dirname, 'giftReactions.js'));

describe('policy gating', () => {
  beforeEach(() => {
    policyEngine.setPolicy({ giftReaction: true, voiceOut: true });
    giftReactions.clearReactionLog();
  });

  it('isApproved returns false when policy denies', () => {
    policyEngine.setPolicy({ giftReaction: false });
    assert.strictEqual(policyEngine.isApproved('giftReaction'), false);
  });

  it('isApproved returns true when policy allows', () => {
    policyEngine.setPolicy({ giftReaction: true });
    assert.strictEqual(policyEngine.isApproved('giftReaction'), true);
  });

  it('requireApproval throws when policy denies', () => {
    policyEngine.setPolicy({ giftReaction: false });
    assert.throws(() => policyEngine.requireApproval('giftReaction'), /POLICY_DENIED/);
  });

  it('reactToGift throws when giftReaction policy denies (policy gating verified)', async () => {
    policyEngine.setPolicy({ giftReaction: false });
    await assert.rejects(
      () => giftReactions.reactToGift({ id: 'g1' }, 'stream1'),
      /POLICY_DENIED/
    );
    assert.strictEqual(giftReactions.getReactionLog().length, 0);
  });

  it('reactToGift returns reaction when policy allows (policy gating verified)', async () => {
    policyEngine.setPolicy({ giftReaction: true });
    const reaction = await giftReactions.reactToGift({ id: 'g1' }, 'stream1');
    assert.ok(reaction.type === 'gift_reaction' && reaction.streamId === 'stream1');
    assert.strictEqual(giftReactions.getReactionLog().length, 1);
  });
});
