/**
 * Creator approval — session must be approved before charging.
 * https://milloapp.com
 */
const sessions = require('./sessions');

async function creatorApproval(sessionId, creatorId, approved) {
  if (!approved) return sessions.getSession(sessionId);
  return sessions.approveSession(sessionId, creatorId);
}

module.exports = { creatorApproval };
