/**
 * MILLA — Virtual Streamer. AI policy engine, voice hooks, gift reactions, moderation wrapper.
 * NEVER acts without policy approval. https://milloapp.com
 */
const policyEngine = require('./policyEngine');
const voiceHooks = require('./voiceHooks');
const giftReactions = require('./giftReactions');
const giftPersonalization = require('./giftPersonalization');
const moderationWrapper = require('./moderationWrapper');
const liveIntegration = require('./liveIntegration');
const aiChat = require('./aiChat');

module.exports = {
  ...policyEngine,
  ...voiceHooks,
  ...giftReactions,
  ...giftPersonalization,
  ...moderationWrapper,
  ...liveIntegration,
  ...aiChat,
};
