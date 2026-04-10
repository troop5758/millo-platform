'use strict';
/**
 * Trust Score System — Core anti-abuse engine. Dynamic 0–100 trust score per account.
 * Range: 0–30 high risk, 31–60 medium, 61–85 normal, 86–100 trusted.
 * https://milloapp.com
 */
const db = require('@millo/database');

const ACCOUNT_AGE_MAX_DAYS = Number(process.env.TRUST_ACCOUNT_AGE_MAX_DAYS) || 365;
const REPORT_PENALTY_MAX = 100;
const BEHAVIOR_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Risk level from score: high < 30, medium < 60, else low. */
function riskLevelFromScore(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s < 30) return 'high';
  if (s < 60) return 'medium';
  return 'low';
}

/**
 * Gather all factor signals (each 0–100; reportScore is penalty, higher = worse).
 */
async function gatherSignals(userId) {
  if (!userId) {
    return {
      accountAge: 0,
      deviceReputation: 0,
      behaviorScore: 0,
      paymentTrust: 0,
      socialGraphScore: 0,
      reportScore: 0,
    };
  }
  const uid = userId.toString?.() || userId;

  const [user, deviceReputation, behaviorScore, paymentTrust, socialGraphScore, reportScore] = await Promise.all([
    db.User.findById(uid).select('createdAt').lean(),
    getDeviceReputationFactor(uid),
    getBehaviorFactor(uid),
    getPaymentTrustFactor(uid),
    getSocialGraphFactor(uid),
    getReportPenaltyFactor(uid),
  ]);

  const accountAge = getAccountAgeFactor(user?.createdAt);

  return {
    accountAge,
    deviceReputation,
    behaviorScore,
    paymentTrust,
    socialGraphScore,
    reportScore,
  };
}

/** 0–100: older account = higher. */
function getAccountAgeFactor(createdAt) {
  if (!createdAt) return 0;
  const days = (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.min(100, Math.round((days / ACCOUNT_AGE_MAX_DAYS) * 100));
}

/** 0–100: single device, not shared across many accounts = higher. */
async function getDeviceReputationFactor(userId) {
  const riskEngine = require('./riskEngine');
  const count = await riskEngine.getDeviceReuseAccountCount(userId);
  if (count === 0) return 100;
  if (count >= 10) return 0;
  return Math.max(0, 100 - count * 10);
}

/** 0–100: human-like behavior (scroll/mouse/biometrics) vs bot-like. Blends ratio with biometric variance score when available. */
async function getBehaviorFactor(userId) {
  const since = new Date(Date.now() - BEHAVIOR_WINDOW_MS);
  const [human, actions, biometricResult] = await Promise.all([
    db.BehaviorEvent.countDocuments({
      userId,
      timestamp: { $gte: since },
      eventType: { $in: ['scroll', 'mousemove', 'click', 'mouse_move', 'scroll_speed'] },
    }),
    db.BehaviorEvent.countDocuments({
      userId,
      timestamp: { $gte: since },
      eventType: { $in: ['video_watch', 'like', 'comment', 'share'] },
    }),
    (async () => {
      try {
        const behaviorMetrics = require('./behaviorMetricsService');
        return await behaviorMetrics.analyzeBehaviorMetrics(userId, BEHAVIOR_WINDOW_MS);
      } catch {
        return { score: 50, sampleCount: 0 };
      }
    })(),
  ]);
  const total = human + actions;
  let base = 50;
  if (total > 0) {
    const humanRatio = human / total;
    base = Math.min(100, Math.round(40 + humanRatio * 60));
  }
  if (biometricResult.sampleCount >= 5) {
    base = Math.round((base + biometricResult.score) / 2);
  }
  return Math.max(0, Math.min(100, base));
}

/** 0–100: successful payments, no chargebacks. */
async function getPaymentTrustFactor(userId) {
  const [completed, chargebacks] = await Promise.all([
    db.PaymentTransaction.countDocuments({ userId, status: 'completed' }),
    db.Chargeback.countDocuments({ userId }),
  ]);
  if (chargebacks > 0) return Math.max(0, 30 - chargebacks * 15);
  if (completed === 0) return 50;
  return Math.min(100, 50 + Math.min(50, completed * 5));
}

/** 0–100: diverse social graph, not in tight bot cluster. */
async function getSocialGraphFactor(userId) {
  try {
    const botGraph = require('./botGraphDetection');
    const { isBotCluster, inClusterRatio = 0 } = await botGraph.detectBotCluster(userId);
    if (isBotCluster) return Math.max(0, 50 - Math.round(inClusterRatio * 50));
    const followCount = await db.Follow.countDocuments({ followerId: userId });
    if (followCount === 0) return 50;
    return Math.min(100, 50 + Math.min(50, Math.floor(followCount / 2)));
  } catch {
    return 50;
  }
}

/** 0–100 penalty: reports against this user (as target). */
async function getReportPenaltyFactor(userId) {
  const u = userId?.toString?.() || userId;
  const count = await db.Report.countDocuments({
    targetType: 'user',
    targetId: u,
  });
  if (count === 0) return 0;
  if (count >= 5) return REPORT_PENALTY_MAX;
  return Math.min(REPORT_PENALTY_MAX, count * 20);
}

function uid(id) {
  return id?.toString?.() || id;
}

/**
 * Calculate trust score from factors. Formula: accountAge*0.2 + deviceReputation*0.2 + behaviorScore*0.25 + paymentTrust*0.15 + socialGraphScore*0.15 - reportScore*0.25
 */
function calculateFromFactors(factors) {
  let score =
    (factors.accountAge || 0) * 0.2 +
    (factors.deviceReputation || 0) * 0.2 +
    (factors.behaviorScore || 0) * 0.25 +
    (factors.paymentTrust || 0) * 0.15 +
    (factors.socialGraphScore || 0) * 0.15 -
    (factors.reportScore || 0) * 0.25;
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  const riskLevel = riskLevelFromScore(score);
  return { score, riskLevel };
}

/**
 * Calculate trust score for a user; optionally persist to AccountTrustScore.
 * @returns {{ score: number, riskLevel: string, factors: object }}
 */
async function calculateTrustScore(userId, opts = {}) {
  const factors = await gatherSignals(userId);
  const { score, riskLevel } = calculateFromFactors(factors);
  const result = { score, riskLevel, factors };

  if (opts.persist !== false) {
    await db.AccountTrustScore.findOneAndUpdate(
      { userId: uid(userId) },
      {
        $set: {
          score,
          riskLevel,
          factors: {
            accountAge: factors.accountAge,
            deviceReputation: factors.deviceReputation,
            behaviorScore: factors.behaviorScore,
            paymentTrust: factors.paymentTrust,
            socialGraphScore: factors.socialGraphScore,
            reportScore: factors.reportScore,
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).catch(() => {});
    try {
      const trustHistoryService = require('./trustHistoryService');
      await trustHistoryService.snapshot(userId, score, result.factors);
    } catch (_) {}
  }

  return result;
}

/**
 * Get cached trust score for user (from AccountTrustScore). If missing, calculate and persist.
 */
async function getTrustScore(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return { score: 0, riskLevel: 'high', factors: {} };
  const doc = await db.AccountTrustScore.findOne({ userId: uid }).lean();
  if (doc) return { score: doc.score, riskLevel: doc.riskLevel, factors: doc.factors || {} };
  return calculateTrustScore(uid, { persist: true });
}

module.exports = {
  calculateTrustScore,
  getTrustScore,
  gatherSignals,
  riskLevelFromScore,
  calculateFromFactors,
};
