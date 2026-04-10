/**
 * Gift reactions — MILLA reacts to gifts only when policy approves.
 * https://milloapp.com
 */
const policyEngine = require('./policyEngine');
const voiceHooks = require('./voiceHooks');
const moderationWrapper = require('./moderationWrapper');

const reactionLog = [];

async function reactToGift(gift, streamId) {
  policyEngine.requireApproval('giftReaction', { gift, streamId });
  const reaction = { type: 'gift_reaction', giftId: gift?.id, streamId, at: new Date().toISOString() };
  reactionLog.push(reaction);
  const content = `Thanks for the gift!`;
  const allowed = await moderationWrapper.checkContent(content, streamId);
  if (allowed) voiceHooks.emitHook('out', { type: 'gift_reaction', content, streamId });
  return reaction;
}

function getReactionLog() {
  return [...reactionLog];
}

function clearReactionLog() {
  reactionLog.length = 0;
}

module.exports = { reactToGift, getReactionLog, clearReactionLog };
