/**
 * MILLA Live Integration — co-host, gift triggers, AI throttling, force mute, kill-switch.
 * https://milloapp.com
 */
const giftReactions = require('./giftReactions');
const voiceHooks = require('./voiceHooks');

const coHostStreams = new Set();
const mutedStreams = new Set();
const lastGiftReactionAt = new Map();
const THROTTLE_MS = 10000;

function millaEnabled() {
  return process.env.MILLA_ENABLED !== 'false';
}

function setCoHost(streamId, enabled) {
  const id = String(streamId);
  if (enabled) coHostStreams.add(id);
  else coHostStreams.delete(id);
}

function isCoHost(streamId) {
  return coHostStreams.has(String(streamId));
}

function forceMute(streamId) {
  mutedStreams.add(String(streamId));
}

function forceUnmute(streamId) {
  mutedStreams.delete(String(streamId));
}

function isMuted(streamId) {
  return mutedStreams.has(String(streamId));
}

function setupMutedCheck() {
  voiceHooks.setMutedCheck((streamId) => isMuted(streamId));
}
setupMutedCheck();

function throttleAllowsGiftReaction(streamId) {
  const id = String(streamId);
  const last = lastGiftReactionAt.get(id);
  if (!last) return true;
  return Date.now() - last >= THROTTLE_MS;
}

function recordGiftReaction(streamId) {
  lastGiftReactionAt.set(String(streamId), Date.now());
}

async function onGift(streamId, gift) {
  if (!millaEnabled()) return null;
  if (!isCoHost(streamId)) return null;
  if (!throttleAllowsGiftReaction(streamId)) return null;
  try {
    const reaction = await giftReactions.reactToGift(gift, streamId);
    recordGiftReaction(streamId);
    return reaction;
  } catch (e) {
    if (e.message === 'POLICY_DENIED') return null;
    throw e;
  }
}

module.exports = {
  millaEnabled,
  setCoHost,
  isCoHost,
  forceMute,
  forceUnmute,
  isMuted,
  onGift,
  THROTTLE_MS,
};
