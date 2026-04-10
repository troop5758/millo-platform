'use strict';
/**
 * Engagement Scoring — Short video. Weights: likes×3, comments×4, shares×5, watch_time.
 * https://milloapp.com
 */
const WEIGHTS = { likes: 3, comments: 4, shares: 5, watchTime: 1 };

/**
 * Calculate engagement score for a short video.
 * @param {object} video - { likes, comments, shares, watch_time? | watchTimeSeconds? }
 * @returns {number}
 */
function calculateScore(video) {
  if (!video) return 0;
  const likes = Number(video.likes ?? video.likeCount ?? 0) || 0;
  const comments = Number(video.comments ?? video.commentCount ?? 0) || 0;
  const shares = Number(video.shares ?? video.shareCount ?? 0) || 0;
  const watchTime = Number(video.watch_time ?? video.watchTimeSeconds ?? 0) || 0;
  return (
    likes * WEIGHTS.likes +
    comments * WEIGHTS.comments +
    shares * WEIGHTS.shares +
    watchTime * WEIGHTS.watchTime
  );
}

module.exports = { calculateScore, WEIGHTS };
