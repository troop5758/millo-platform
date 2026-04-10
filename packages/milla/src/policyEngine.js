/**
 * AI policy engine — MILLA NEVER acts without policy approval.
 * https://milloapp.com
 */
let policy = {
  giftReaction: true,
  voiceOut: true,
  voiceIn: true,
};

function getPolicy() {
  return { ...policy };
}

function setPolicy(p) {
  policy = { ...policy, ...p };
}

/**
 * Returns true only if the action is approved by policy. MILLA must call this before every action.
 */
function isApproved(action, context = {}) {
  if (policy[action] === false) return false;
  if (policy[action] === true) return true;
  return false;
}

/**
 * Throws if not approved. Use before any MILLA action.
 */
function requireApproval(action, context = {}) {
  if (!isApproved(action, context)) {
    throw new Error('POLICY_DENIED');
  }
}

module.exports = { getPolicy, setPolicy, isApproved, requireApproval };
