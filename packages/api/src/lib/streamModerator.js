'use strict';
/**
 * Creator-appointed stream moderators. Check if a user can moderate a stream (owner or listed StreamModerator).
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * Check if userId is allowed to moderate the given stream (stream owner or creator-appointed moderator).
 * @param {string|ObjectId} streamId
 * @param {string|ObjectId} userId
 * @returns {Promise<boolean>}
 */
async function isModeratorForStream(streamId, userId) {
  if (!streamId || !userId) return false;
  const stream = await db.LiveStream.findById(streamId).select('userId').lean();
  if (!stream) return false;
  const creatorId = stream.userId?.toString?.() || stream.userId;
  const uid = userId.toString?.() || String(userId);
  if (creatorId === uid) return true;
  const exists = await db.StreamModerator.exists({ creatorId, moderatorId: uid });
  return !!exists;
}

module.exports = { isModeratorForStream };
