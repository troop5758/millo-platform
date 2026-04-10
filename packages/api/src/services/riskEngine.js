'use strict';
/**
 * Bot Risk Scoring Engine — every user gets a risk score from activity signals.
 * Signals: likes/min, same device many accounts, identical comments, no mouse movement, new account mass follows.
 * https://milloapp.com
 */
const db = require('@millo/database');

// Score contributions (align with product table)
const LIKES_PER_MIN_THRESHOLD = Number(process.env.RISK_LIKES_PER_MIN_THRESHOLD) || 100;
const LIKES_PER_MIN_SCORE = 40;

const SAME_DEVICE_ACCOUNTS_THRESHOLD = Number(process.env.RISK_SAME_DEVICE_ACCOUNTS_THRESHOLD) || 100;
const SAME_DEVICE_ACCOUNTS_SCORE = 50;

const IDENTICAL_COMMENTS_SCORE = 30;

const NO_MOUSE_MOVEMENT_SCORE = 20;
const NO_MOUSE_ACTIVITY_MIN_EVENTS = 10;
const NO_MOUSE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Low human-likeness from {@link behaviorMetricsService.analyzeBehaviorMetrics} when enough samples exist. */
const BEHAVIOR_BOTLIKE_SCORE_MAX = Number(process.env.RISK_BEHAVIOR_BOTLIKE_MAX) || 35;
const BEHAVIOR_BOTLIKE_MIN_SAMPLES = Number(process.env.RISK_BEHAVIOR_BOTLIKE_MIN_SAMPLES) || 5;
const BEHAVIOR_BOTLIKE_RISK = Number(process.env.RISK_BEHAVIOR_BOTLIKE_SCORE) || 15;

const NEW_ACCOUNT_DAYS = Number(process.env.RISK_NEW_ACCOUNT_DAYS) || 7;
const MASS_FOLLOW_THRESHOLD = Number(process.env.RISK_MASS_FOLLOW_THRESHOLD) || 50;
const MASS_FOLLOW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const NEW_ACCOUNT_MASS_FOLLOW_SCORE = 30;

const BOT_CLUSTER_SCORE = 25;

// Trust Graph risk contributions (Neo4j / graph signals) — see §8 Trust Graph Risk Scoring
const TRUST_GRAPH_DEVICE_CLUSTER_RISK = Number(process.env.RISK_TRUST_GRAPH_DEVICE_CLUSTER) || 40;
const TRUST_GRAPH_GIFT_RING_RISK = Number(process.env.RISK_TRUST_GRAPH_GIFT_RING) || 50;
const TRUST_GRAPH_ENGAGEMENT_CLUSTER_RISK = Number(process.env.RISK_TRUST_GRAPH_ENGAGEMENT_CLUSTER) || 30;
const TRUST_GRAPH_PAYMENT_CLUSTER_RISK = Number(process.env.RISK_TRUST_GRAPH_PAYMENT_CLUSTER) || 50;

/**
 * Likes per minute (last minute) for user.
 */
async function getLikesPerMinute(userId) {
  if (!userId) return 0;
  const since = new Date(Date.now() - 60 * 1000);
  return db.StreamLike.countDocuments({ userId, createdAt: { $gte: since } });
}

/**
 * True if user has duplicate/identical comments (same text repeated).
 */
async function detectDuplicateComments(userId) {
  if (!userId) return false;
  const comments = await db.StreamComment.find({ userId, deletedAt: null })
    .select('text')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const texts = comments.map((c) => (c.text || '').trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  for (const t of texts) {
    if (seen.has(t)) return true;
    seen.add(t);
  }
  return false;
}

/**
 * Count of distinct users sharing the same device fingerprint(s) as this user.
 * Returns max account count across any of the user's fingerprints.
 */
async function getDeviceReuseAccountCount(userId) {
  if (!userId) return 0;
  const uid = userId.toString?.() || userId;
  const fingerprints = await db.DeviceFingerprint.find({ userId: uid }).select('fingerprint').lean();
  if (fingerprints.length === 0) return 0;
  let maxAccounts = 0;
  for (const { fingerprint } of fingerprints) {
    if (!fingerprint) continue;
    const count = await db.DeviceFingerprint.distinct('userId', { fingerprint }).then((ids) => ids.length);
    if (count > maxAccounts) maxAccounts = count;
  }
  return maxAccounts;
}

/**
 * True if user has meaningful activity but no scroll/mouse behavior (bot-like).
 */
async function detectNoMouseMovement(userId) {
  if (!userId) return false;
  const since = new Date(Date.now() - NO_MOUSE_WINDOW_MS);
  const uid = userId.toString?.() || userId;
  const [actionCount, scrollCount] = await Promise.all([
    db.BehaviorEvent.countDocuments({
      userId: uid,
      timestamp: { $gte: since },
      eventType: { $in: ['video_watch', 'like', 'comment', 'share'] },
    }),
    db.BehaviorEvent.countDocuments({
      userId: uid,
      timestamp: { $gte: since },
      eventType: { $in: ['scroll', 'mousemove', 'click', 'mouse_move', 'scroll_speed'] },
    }),
  ]);
  return actionCount >= NO_MOUSE_ACTIVITY_MIN_EVENTS && scrollCount === 0;
}

/**
 * True if account is new and user did mass follows in last 24h.
 */
async function detectNewAccountMassFollows(userId) {
  if (!userId) return false;
  const uid = userId.toString?.() || userId;
  const user = await db.User.findById(uid).select('createdAt').lean();
  if (!user || !user.createdAt) return false;
  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  if (accountAgeMs > NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000) return false;
  const since = new Date(Date.now() - MASS_FOLLOW_WINDOW_MS);
  const count = await db.Follow.countDocuments({ followerId: uid, createdAt: { $gte: since } });
  return count >= MASS_FOLLOW_THRESHOLD;
}

/**
 * Calculate bot risk score for a user (0–100+). Returns { score, signals }.
 * @param {string|ObjectId} userId
 * @returns {Promise<{ score: number, signals: string[] }>}
 */
async function calculateRisk(userId) {
  if (!userId) return { score: 0, signals: [] };
  const uid = userId.toString?.() || userId;
  let score = 0;
  const signals = [];

  const likesPerMinute = await getLikesPerMinute(uid);
  if (likesPerMinute >= LIKES_PER_MIN_THRESHOLD) {
    score += LIKES_PER_MIN_SCORE;
    signals.push('high_likes_per_minute');
  }

  const duplicateComments = await detectDuplicateComments(uid);
  if (duplicateComments) {
    score += IDENTICAL_COMMENTS_SCORE;
    signals.push('identical_comments');
  }

  const deviceAccountCount = await getDeviceReuseAccountCount(uid);
  if (deviceAccountCount >= SAME_DEVICE_ACCOUNTS_THRESHOLD) {
    score += SAME_DEVICE_ACCOUNTS_SCORE;
    signals.push('device_reuse');
  }

  const noMouse = await detectNoMouseMovement(uid);
  if (noMouse) {
    score += NO_MOUSE_MOVEMENT_SCORE;
    signals.push('no_mouse_movement');
  }

  try {
    const behaviorMetrics = require('./behaviorMetricsService');
    const bio = await behaviorMetrics.analyzeBehaviorMetrics(uid, NO_MOUSE_WINDOW_MS);
    if (
      bio.sampleCount >= BEHAVIOR_BOTLIKE_MIN_SAMPLES
      && bio.score <= BEHAVIOR_BOTLIKE_SCORE_MAX
      && !bio.signals.includes('insufficient_samples')
    ) {
      score += BEHAVIOR_BOTLIKE_RISK;
      signals.push('behavior_biometrics_botlike');
    }
  } catch (_) {
    /* optional */
  }

  const newAccountMassFollow = await detectNewAccountMassFollows(uid);
  if (newAccountMassFollow) {
    score += NEW_ACCOUNT_MASS_FOLLOW_SCORE;
    signals.push('new_account_mass_follows');
  }

  try {
    const botGraphDetection = require('./botGraphDetection');
    const { isBotCluster } = await botGraphDetection.detectBotCluster(uid);
    if (isBotCluster) {
      score += BOT_CLUSTER_SCORE;
      signals.push('bot_cluster');
    }
  } catch (_) {
    // optional: graph detection can be disabled or fail
  }

  try {
    const neo4jClusterService = require('./neo4jClusterService');
    if (neo4jClusterService.isEnabled()) {
      const cluster = await neo4jClusterService.getClusterSignals(uid);
      if (cluster.inGiftRing) {
        score += TRUST_GRAPH_GIFT_RING_RISK;
        signals.push('neo4j_gift_ring');
      }
      if (cluster.signals?.includes('neo4j_account_cluster') || cluster.accountClusterId) {
        score += TRUST_GRAPH_DEVICE_CLUSTER_RISK;
        signals.push('neo4j_account_cluster');
      }
      if (cluster.inLikeFarm) {
        score += TRUST_GRAPH_ENGAGEMENT_CLUSTER_RISK;
        signals.push('neo4j_like_farm');
      }
      if (cluster.inPaymentCluster) {
        score += TRUST_GRAPH_PAYMENT_CLUSTER_RISK;
        signals.push('neo4j_payment_cluster');
      }
    }
  } catch (_) {
    // optional: Neo4j Phase 6 not configured or failed
  }

  return { score: Math.min(100, score), signals };
}

module.exports = {
  calculateRisk,
  getLikesPerMinute,
  detectDuplicateComments,
  getDeviceReuseAccountCount,
  detectNoMouseMovement,
  detectNewAccountMassFollows,
};
