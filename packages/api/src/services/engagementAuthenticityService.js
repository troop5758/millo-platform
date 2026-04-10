'use strict';
/**
 * Engagement Authenticity Scoring — evaluate whether engagement is organic or manipulated.
 *
 * Formula:
 *   authenticity = uniqueUsersInteracting / totalInteractions
 *
 * Examples:
 *   Bad:  1000 likes, 10 unique users  → authenticity = 10/1000  = 0.01
 *   Good: 1000 likes, 850 unique users → authenticity = 850/1000 = 0.85
 *
 * https://milloapp.com
 */
const db = require('@millo/database');

const MIN_INTERACTIONS_FOR_SCORE = 10;

/**
 * Get stream IDs owned by creator (userId).
 */
async function getStreamIdsByCreator(creatorId) {
  if (!creatorId) return [];
  const streams = await db.LiveStream.find({ userId: creatorId }).select('_id').lean();
  return streams.map((s) => s._id);
}

/**
 * Compute engagement metrics for a single stream.
 * totalInteractions = likes + comments (multiple per user possible for comments).
 * uniqueUsersInteracting = distinct userId across likes and comments.
 */
async function getStreamEngagementMetrics(streamId) {
  if (!streamId) return { totalInteractions: 0, uniqueUsersInteracting: 0, authenticity: 0, engagementQuality: 0 };
  const sid = streamId.toString?.() || streamId;

  const [likes, comments] = await Promise.all([
    db.StreamLike.find({ streamId: sid }).select('userId').lean(),
    db.StreamComment.find({ streamId: sid, deletedAt: null }).select('userId').lean(),
  ]);

  const totalLikes = likes.length;
  const totalComments = comments.length;
  const totalInteractions = totalLikes + totalComments;

  const uniqueUserIds = new Set([
    ...likes.map((l) => l.userId?.toString()).filter(Boolean),
    ...comments.map((c) => c.userId?.toString()).filter(Boolean),
  ]);
  const uniqueUsersInteracting = uniqueUserIds.size;

  // authenticity = uniqueUsersInteracting / totalInteractions (0–1)
  const authenticity = totalInteractions > 0
    ? uniqueUsersInteracting / totalInteractions
    : 0;
  const engagementQuality = Math.min(1, authenticity);

  return {
    streamId: sid,
    totalInteractions,
    uniqueUsersInteracting,
    authenticity,
    engagementQuality,
    totalLikes,
    totalComments,
  };
}

/**
 * Compute engagement metrics for a creator (all their streams).
 * Example: 500 likes + comments from 3 unique users => bad. 500 from 420 unique => good.
 */
async function getCreatorEngagementMetrics(creatorId, opts = {}) {
  if (!creatorId) return { totalInteractions: 0, uniqueUsersInteracting: 0, authenticity: 0, engagementQuality: 0 };
  const cid = creatorId.toString?.() || creatorId;
  const streamIds = await getStreamIdsByCreator(cid);
  if (streamIds.length === 0) {
    return {
      creatorId: cid,
      totalInteractions: 0,
      uniqueUsersInteracting: 0,
      authenticity: 0,
      engagementQuality: 0,
      totalLikes: 0,
      totalComments: 0,
      viewerDiversity: 0,
      followerInteractionRatio: null,
    };
  }

  const [likes, comments, viewers] = await Promise.all([
    db.StreamLike.find({ streamId: { $in: streamIds } }).select('userId').lean(),
    db.StreamComment.find({ streamId: { $in: streamIds }, deletedAt: null }).select('userId').lean(),
    opts.includeViewers
      ? db.LiveViewer.find({ streamId: { $in: streamIds } }).select('userId').lean()
      : Promise.resolve([]),
  ]);

  const totalInteractions = likes.length + comments.length;
  const uniqueUserIds = new Set([
    ...likes.map((l) => l.userId?.toString()).filter(Boolean),
    ...comments.map((c) => c.userId?.toString()).filter(Boolean),
  ]);
  const uniqueUsersInteracting = uniqueUserIds.size;
  const authenticity = totalInteractions > 0
    ? uniqueUsersInteracting / totalInteractions
    : 0;
  const engagementQuality = Math.min(1, authenticity);

  let viewerDiversity = 0;
  if (viewers.length > 0) {
    const uniqueViewers = new Set(viewers.map((v) => v.userId?.toString()).filter(Boolean));
    viewerDiversity = uniqueViewers.size;
  }

  let followerInteractionRatio = null;
  if (uniqueUsersInteracting > 0) {
    const interactorIds = [...uniqueUserIds];
    const followerCount = await db.Follow.countDocuments({
      followingId: cid,
      followerId: { $in: interactorIds },
    });
    followerInteractionRatio = followerCount / uniqueUsersInteracting;
  }

  return {
    creatorId: cid,
    totalInteractions,
    uniqueUsersInteracting,
    authenticity,
    engagementQuality,
    totalLikes: likes.length,
    totalComments: comments.length,
    viewerDiversity,
    followerInteractionRatio,
  };
}

/**
 * Engagement authenticity for a single content item.
 * authenticity = uniqueUsersInteracting / totalInteractions (0–1).
 * @param {string|ObjectId} contentId
 * @param {string} [contentType='stream']
 * @returns {Promise<{ authenticity: number, uniqueUsersInteracting: number, totalInteractions: number }>}
 */
async function getEngagementAuthenticity(contentId, contentType = 'stream') {
  if (contentType === 'stream') {
    const m = await getStreamEngagementMetrics(contentId);
    return {
      authenticity: m.totalInteractions > 0 ? m.uniqueUsersInteracting / m.totalInteractions : 0,
      uniqueUsersInteracting: m.uniqueUsersInteracting,
      totalInteractions: m.totalInteractions,
    };
  }
  return { authenticity: 0, uniqueUsersInteracting: 0, totalInteractions: 0 };
}

/**
 * Authenticity score 0–100 from engagement quality and signals.
 * Good: high engagementQuality (many unique users), healthy viewer diversity, organic follower ratio.
 */
function authenticityScoreFromMetrics(metrics) {
  if (metrics.totalInteractions < MIN_INTERACTIONS_FOR_SCORE) {
    return { score: 50, signals: ['insufficient_interactions'] };
  }

  const signals = [];
  let score = 50;

  if (metrics.engagementQuality >= 0.8) {
    score += 25;
    signals.push('high_engagement_diversity');
  } else if (metrics.engagementQuality >= 0.5) {
    score += 10;
    signals.push('moderate_engagement_diversity');
  } else if (metrics.engagementQuality < 0.1 && metrics.totalInteractions >= 50) {
    score -= 30;
    signals.push('low_engagement_diversity');
  } else if (metrics.engagementQuality < 0.3) {
    score -= 15;
    signals.push('suspicious_engagement_diversity');
  }

  if (metrics.viewerDiversity > 0 && metrics.uniqueUsersInteracting > 0) {
    const viewerToInteractorRatio = metrics.viewerDiversity / Math.max(1, metrics.uniqueUsersInteracting);
    if (viewerToInteractorRatio >= 1) {
      signals.push('broad_viewer_base');
      score += 5;
    }
  }

  if (metrics.followerInteractionRatio != null) {
    if (metrics.followerInteractionRatio >= 0.3 && metrics.followerInteractionRatio <= 0.9) {
      signals.push('organic_follower_engagement');
      score += 5;
    } else if (metrics.followerInteractionRatio > 0.98 && metrics.uniqueUsersInteracting > 20) {
      signals.push('possible_inflated_follower_engagement');
      score -= 10;
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    signals,
  };
}

/**
 * Get full authenticity result for a stream: metrics + score.
 */
async function getStreamAuthenticity(streamId) {
  const metrics = await getStreamEngagementMetrics(streamId);
  const { score, signals } = authenticityScoreFromMetrics(metrics);
  return { ...metrics, authenticityScore: score, signals };
}

/**
 * Get full authenticity result for a creator (all streams): metrics + score.
 */
async function getCreatorAuthenticity(creatorId, opts = {}) {
  const metrics = await getCreatorEngagementMetrics(creatorId, { ...opts, includeViewers: true });
  const { score, signals } = authenticityScoreFromMetrics(metrics);
  return { ...metrics, authenticityScore: score, signals };
}

module.exports = {
  getStreamEngagementMetrics,
  getCreatorEngagementMetrics,
  getEngagementAuthenticity,
  getStreamAuthenticity,
  getCreatorAuthenticity,
  authenticityScoreFromMetrics,
  getStreamIdsByCreator,
};
