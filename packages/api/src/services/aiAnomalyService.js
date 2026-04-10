'use strict';
/**
 * AI anomaly detection (shadow mode) — scores sessions/users for bot-like behavior.
 * Only runs when AI_ANOMALY_DETECTION_ENABLED=true. No auto-apply; results for admin dashboard only.
 * https://milloapp.com
 */
const db = require('@millo/database');

const ENABLED = process.env.AI_ANOMALY_DETECTION_ENABLED === 'true';
const SCORE_BATCH = 20;
const BEHAVIOR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function isEnabled() {
  return ENABLED;
}

/**
 * Heuristic anomaly score 0–100 from behavior + activity signals (shadow; no side effects).
 * Uses: action rate, lack of human-like events (scroll/mouse), duplicate actions.
 */
async function scoreUserAnomaly(userId) {
  if (!userId) return { score: 0, signals: [], shadowMode: true };
  const uid = userId.toString?.() || userId;

  let score = 0;
  const signals = [];

  const since = new Date(Date.now() - BEHAVIOR_WINDOW_MS);

  const [actionEvents, humanEvents, commentCount] = await Promise.all([
    db.BehaviorEvent.countDocuments({
      userId: uid,
      timestamp: { $gte: since },
      eventType: { $in: ['like', 'comment', 'share', 'video_watch'] },
    }),
    db.BehaviorEvent.countDocuments({
      userId: uid,
      timestamp: { $gte: since },
      eventType: { $in: ['scroll', 'mousemove', 'click', 'mouse_move', 'scroll_speed'] },
    }),
    db.StreamComment.countDocuments({ userId: uid, deletedAt: null }),
  ]);

  if (actionEvents >= 50 && humanEvents === 0) {
    score += 40;
    signals.push('high_actions_no_human_events');
  } else if (actionEvents >= 20 && humanEvents < 3) {
    score += 25;
    signals.push('low_human_events');
  }

  if (commentCount > 10) {
    const comments = await db.StreamComment.find({ userId: uid, deletedAt: null })
      .select('text')
      .limit(50)
      .lean();
    const texts = comments.map((c) => (c.text || '').trim().toLowerCase()).filter(Boolean);
    const unique = new Set(texts).size;
    if (texts.length > 0 && unique / texts.length < 0.3) {
      score += 30;
      signals.push('repeated_comments');
    }
  }

  const followCount = await db.Follow.countDocuments({
    followerId: uid,
    createdAt: { $gte: since },
  });
  const user = await db.User.findById(uid).select('createdAt').lean();
  const accountAgeDays = user?.createdAt
    ? (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)
    : 999;
  if (accountAgeDays < 7 && followCount >= 30) {
    score += 20;
    signals.push('new_account_mass_follow');
  }

  return {
    score: Math.min(100, score),
    signals,
    shadowMode: true,
    applied: false,
  };
}

/**
 * Batch anomaly scores for given user IDs. Only runs when AI_ANOMALY_DETECTION_ENABLED=true.
 * Returns [] when disabled. For admin dashboard only; no auto CAPTCHA/ban.
 */
async function getAnomalyScoresForUsers(userIds, limit = SCORE_BATCH) {
  if (!isEnabled()) return [];
  const ids = [...new Set(userIds.map((id) => String(id)))].slice(0, limit);
  const out = [];
  for (const uid of ids) {
    try {
      const result = await scoreUserAnomaly(uid);
      out.push({ userId: uid, ...result });
    } catch {
      out.push({ userId: uid, score: null, signals: [], shadowMode: true });
    }
  }
  return out;
}

module.exports = {
  isEnabled,
  scoreUserAnomaly,
  getAnomalyScoresForUsers,
};
