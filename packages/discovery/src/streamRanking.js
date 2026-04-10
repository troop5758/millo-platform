'use strict';
/**
 * TikTok-style stream ranking. Gifts contribute to stream ranking.
 * Formula: score = gifts_value + viewer_count + chat_activity
 * https://milloapp.com
 */

/**
 * Compute stream ranking score.
 * @param {Object} stream - { totalGiftCoins?, viewerCount?, ... }
 * @param {number} [viewerCount] - Override from LiveViewer aggregate
 * @param {number} [chatActivity] - StreamComment count
 * @returns {number}
 */
function computeStreamScore(stream, viewerCount = 0, chatActivity = 0) {
  const giftsValue = stream?.totalGiftCoins ?? 0;
  const viewers = viewerCount ?? stream?.viewerCount ?? stream?.meta?.viewerCount ?? 0;
  const chat = chatActivity ?? 0;
  return giftsValue + viewers + chat;
}

module.exports = { computeStreamScore };
