'use strict';
/**
 * Device Reputation System (Device DNA) — reputation score per device fingerprint.
 * Signals: banned/trusted account counts; optional DNA (WebGL, canvas, audio, GPU, fonts, memory, IP ASN, proxy) in meta.
 * https://milloapp.com
 */
const db = require('@millo/database');

const BANNED_THRESHOLD_VERY_LOW = Number(process.env.DEVICE_REPUTATION_BANNED_THRESHOLD) || 5;
const TRUSTED_THRESHOLD_HIGH = Number(process.env.DEVICE_REPUTATION_TRUSTED_THRESHOLD) || 2;
const NEUTRAL_SCORE = 50;
const VERY_LOW_MAX = 20;
const HIGH_MIN = 70;

/**
 * Compute reputation score from banned and trusted account counts.
 * 5+ banned → very low (0–20); many trusted → high (70–100); new device → neutral (50).
 */
function scoreFromCounts(bannedAccounts, trustedAccounts) {
  if (bannedAccounts >= BANNED_THRESHOLD_VERY_LOW) {
    return Math.max(0, VERY_LOW_MAX - bannedAccounts * 2);
  }
  if (trustedAccounts >= TRUSTED_THRESHOLD_HIGH) {
    return Math.min(100, HIGH_MIN + Math.min(30, trustedAccounts * 10));
  }
  if (bannedAccounts > 0 && trustedAccounts === 0) {
    return Math.max(0, NEUTRAL_SCORE - bannedAccounts * 15);
  }
  if (trustedAccounts > 0 && bannedAccounts === 0) {
    return Math.min(100, NEUTRAL_SCORE + Math.min(30, trustedAccounts * 15));
  }
  return NEUTRAL_SCORE;
}

/**
 * Count banned and trusted accounts linked to this fingerprint (DeviceFingerprint.fingerprint = fingerprintId).
 */
async function countBannedAndTrusted(fingerprintId) {
  if (!fingerprintId || String(fingerprintId).trim().length < 8) {
    return { bannedAccounts: 0, trustedAccounts: 0 };
  }
  const fp = String(fingerprintId).trim().slice(0, 256);
  const links = await db.DeviceFingerprint.find({ fingerprint: fp }).select('userId').lean();
  const userIds = [...new Set(links.map((l) => l.userId?.toString()).filter(Boolean))];
  if (userIds.length === 0) return { bannedAccounts: 0, trustedAccounts: 0 };

  const [users, trustDocs] = await Promise.all([
    db.User.find({ _id: { $in: userIds } }).select('status shadowBanned').lean(),
    db.AccountTrustScore.find({ userId: { $in: userIds } }).select('userId score riskLevel').lean(),
  ]);

  const userToBanned = Object.fromEntries(
    users.map((u) => [String(u._id), u.status === 'banned' || u.shadowBanned === true])
  );
  const userToTrusted = Object.fromEntries(
    (trustDocs || []).map((t) => [String(t.userId), t.riskLevel === 'low' || (t.score && t.score >= 61)])
  );

  let bannedAccounts = 0;
  let trustedAccounts = 0;
  for (const uid of userIds) {
    if (userToBanned[uid]) bannedAccounts++;
    if (userToTrusted[uid]) trustedAccounts++;
  }
  return { bannedAccounts, trustedAccounts };
}

/**
 * Get or create DeviceReputation for fingerprintId; optionally recompute from linked accounts.
 */
async function getReputation(fingerprintId, opts = {}) {
  if (!fingerprintId) return null;
  const fp = String(fingerprintId).trim().slice(0, 256);
  const update = opts.recompute !== false;
  if (update) await updateReputation(fp);
  const doc = await db.DeviceReputation.findOne({ fingerprintId: fp }).lean();
  return doc;
}

/**
 * Recompute and persist device reputation from linked DeviceFingerprint + User + AccountTrustScore.
 */
async function updateReputation(fingerprintId) {
  if (!fingerprintId) return null;
  const fp = String(fingerprintId).trim().slice(0, 256);
  const { bannedAccounts, trustedAccounts } = await countBannedAndTrusted(fp);
  const reputationScore = scoreFromCounts(bannedAccounts, trustedAccounts);

  const updated = await db.DeviceReputation.findOneAndUpdate(
    { fingerprintId: fp },
    {
      $set: {
        reputationScore,
        bannedAccounts,
        trustedAccounts,
        lastSeen: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  return updated;
}

/**
 * Record optional Device DNA signals (WebGL, canvas, audio, GPU, fonts, memory, IP ASN, proxy) into meta.
 */
async function recordSignals(fingerprintId, signals) {
  if (!fingerprintId || !signals || typeof signals !== 'object') return null;
  const fp = String(fingerprintId).trim().slice(0, 256);
  const allowed = [
    'webgl', 'canvas', 'audio', 'gpuModel', 'fonts', 'deviceMemory',
    'ipAsn', 'proxy', 'userAgent', 'screenResolution', 'timezone',
  ];
  const meta = {};
  for (const key of allowed) {
    if (signals[key] !== undefined) meta[key] = signals[key];
  }
  if (Object.keys(meta).length === 0) return await getReputation(fp);

  await db.DeviceReputation.findOneAndUpdate(
    { fingerprintId: fp },
    { $set: { meta, lastSeen: new Date() } },
    { upsert: true }
  );
  return getReputation(fp);
}

/**
 * Get reputation score 0–100 for a fingerprint (for use in trust/risk). Returns 50 if unknown.
 */
async function getReputationScore(fingerprintId) {
  const doc = await getReputation(fingerprintId, { recompute: false });
  return doc ? doc.reputationScore : NEUTRAL_SCORE;
}

module.exports = {
  getReputation,
  updateReputation,
  recordSignals,
  getReputationScore,
  countBannedAndTrusted,
  scoreFromCounts,
};
