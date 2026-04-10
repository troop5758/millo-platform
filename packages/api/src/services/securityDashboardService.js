'use strict';
/**
 * Security dashboard data for admin: suspicious accounts, bot clusters, device fingerprints, risk scores, live alerts, AI anomaly (shadow).
 * https://milloapp.com
 */
const db = require('@millo/database');
const riskEngine = require('./riskEngine');
const aiAnomalyService = require('./aiAnomalyService');
const trustScoreEngine = require('./trustScoreEngine');

const SUSPICIOUS_LIMIT = 50;
const ALERTS_LIMIT = 50;
const RISK_BATCH = 20;
const ALERTS_DAYS = 1;
const SUSPICIOUS_DAYS = 7;

/**
 * User IDs that appeared in FraudEvent with action review/block in the last N days.
 */
async function getSuspiciousAccountIds(limit = SUSPICIOUS_LIMIT, days = SUSPICIOUS_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const docs = await db.FraudEvent.find({
    action: { $in: ['review', 'block'] },
    createdAt: { $gte: since },
    userId: { $ne: null },
  })
    .select('userId createdAt action')
    .sort({ createdAt: -1 })
    .lean();
  const seen = new Set();
  const out = [];
  for (const d of docs) {
    const id = String(d.userId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ userId: id, lastEventAt: d.createdAt, action: d.action });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Device fingerprints shared by more than one user (potential bot clusters).
 */
async function getBotClusterFingerprints(limit = 30) {
  const agg = await db.DeviceFingerprint.aggregate([
    { $group: { _id: '$fingerprint', userIds: { $addToSet: '$userId' }, count: { $sum: 1 } } },
    { $addFields: { userCount: { $size: '$userIds' } } },
    { $match: { userCount: { $gt: 1 } } },
    { $project: { fingerprint: '$_id', userCount: 1, count: 1 } },
    { $sort: { userCount: -1 } },
    { $limit: limit },
  ]);
  return agg.map((r) => ({ fingerprint: r.fingerprint, userCount: r.userCount, deviceCount: r.count }));
}

/**
 * Device fingerprint summary: total count, multi-user fingerprint count.
 */
async function getDeviceFingerprintSummary() {
  const [total, multiUser] = await Promise.all([
    db.DeviceFingerprint.countDocuments(),
    db.DeviceFingerprint.aggregate([
      { $group: { _id: '$fingerprint', users: { $addToSet: '$userId' } } },
      { $match: { 'users.1': { $exists: true } } },
      { $count: 'count' },
    ]),
  ]);
  return {
    totalFingerprints: total,
    fingerprintsSharedByMultipleUsers: multiUser[0]?.count ?? 0,
  };
}

/**
 * Risk scores for given user IDs (batch limit to avoid timeout).
 */
async function getRiskScoresForUsers(userIds, limit = RISK_BATCH) {
  const ids = [...new Set(userIds.map((id) => String(id)))].slice(0, limit);
  const out = [];
  for (const uid of ids) {
    try {
      const { score, signals } = await riskEngine.calculateRisk(uid);
      out.push({ userId: uid, score, signals });
    } catch {
      out.push({ userId: uid, score: null, signals: [] });
    }
  }
  return out;
}

/**
 * Trust scores (0–100, riskLevel, factors) for given user IDs. Uses cached AccountTrustScore when present.
 */
async function getTrustScoresForUsers(userIds, limit = RISK_BATCH) {
  const ids = [...new Set(userIds.map((id) => String(id)))].slice(0, limit);
  const out = [];
  for (const uid of ids) {
    try {
      const data = await trustScoreEngine.getTrustScore(uid);
      out.push({ userId: uid, score: data.score, riskLevel: data.riskLevel, factors: data.factors });
    } catch {
      out.push({ userId: uid, score: null, riskLevel: 'high', factors: {} });
    }
  }
  return out;
}

/**
 * Recent fraud/live alerts: FraudEvent (review/block) and stream bot flags in last 24h.
 */
async function getLiveAlerts(limit = ALERTS_LIMIT, days = ALERTS_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await db.FraudEvent.find({
    $or: [
      { action: { $in: ['review', 'block'] } },
      { refType: 'stream', eventType: 'viewer_spike' },
    ],
    createdAt: { $gte: since },
  })
    .select('userId eventType action refType refId createdAt meta')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return events.map((e) => ({
    id: e._id?.toString(),
    userId: e.userId?.toString(),
    eventType: e.eventType,
    action: e.action,
    refType: e.refType,
    refId: e.refId?.toString(),
    createdAt: e.createdAt,
    meta: e.meta,
  }));
}

/**
 * Full security dashboard payload for admin.
 */
async function getSecurityDashboard(opts = {}) {
  const suspiciousLimit = opts.suspiciousLimit ?? SUSPICIOUS_LIMIT;
  const alertsLimit = opts.alertsLimit ?? ALERTS_LIMIT;
  const riskBatch = opts.riskBatch ?? RISK_BATCH;

  const [suspiciousAccounts, botClusters, deviceSummary, liveAlerts] = await Promise.all([
    getSuspiciousAccountIds(suspiciousLimit, SUSPICIOUS_DAYS),
    getBotClusterFingerprints(30),
    getDeviceFingerprintSummary(),
    getLiveAlerts(alertsLimit, ALERTS_DAYS),
  ]);

  const userIdsForRisk = suspiciousAccounts.map((a) => a.userId);
  const [riskScores, aiAnomalyScores, trustScores] = await Promise.all([
    getRiskScoresForUsers(userIdsForRisk, riskBatch),
    aiAnomalyService.getAnomalyScoresForUsers(userIdsForRisk, riskBatch),
    getTrustScoresForUsers(userIdsForRisk, riskBatch),
  ]);

  const payload = {
    suspiciousAccounts,
    botClusters,
    deviceFingerprints: deviceSummary,
    riskScores,
    trustScores,
    liveAlerts,
  };
  if (aiAnomalyService.isEnabled()) {
    payload.aiAnomalyScores = aiAnomalyScores;
    payload.aiAnomalyShadowMode = true;
  }
  return payload;
}

module.exports = {
  getSecurityDashboard,
  getSuspiciousAccountIds,
  getBotClusterFingerprints,
  getDeviceFingerprintSummary,
  getRiskScoresForUsers,
  getTrustScoresForUsers,
  getLiveAlerts,
};
