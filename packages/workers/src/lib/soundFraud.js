/**
 * Anti-gaming: fraud_score per sound from bot views, same IP uploads, coordinated accounts, rapid reuse same device.
 * If high → sound removed from trending. https://milloapp.com
 */
const db = require('@millo/database');

const BOT_VIEWS_MIN_VIEWS = 100;
const BOT_VIEWS_MAX_AVG_WATCH_SEC = 10;
const BOT_VIEWS_SCORE = 30;

const SAME_IP_MIN_CREATORS = 3;
const SAME_IP_SCORE = 25;

const COORDINATED_MIN_ACCOUNTS = 3;
const COORDINATED_SCORE = 25;

const RAPID_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RAPID_REUSE_MIN_COUNT = 5;
const RAPID_REUSE_SCORE = 25;

/**
 * Compute fraud score (0–100) for a sound from manipulation signals.
 * @param {string} soundId - MusicTrack id
 * @param {{ videoIds: string[], creatorIds: string[], totalViews: number, watchTimeSum: number }} context - from trending aggregation
 * @returns {{ fraudScore: number, signals: string[] }}
 */
async function getSoundFraudScore(soundId, context) {
  const signals = [];
  let fraudScore = 0;
  const creatorIds = context.creatorIds || [];
  const videoIds = context.videoIds || [];
  const totalViews = context.totalViews || 0;
  const watchTimeSum = context.watchTimeSum || 0;

  // 1. Bot views: high views with very low avg watch time
  if (totalViews >= BOT_VIEWS_MIN_VIEWS) {
    const avgWatchSec = watchTimeSum / totalViews;
    if (avgWatchSec < BOT_VIEWS_MAX_AVG_WATCH_SEC) {
      signals.push('bot_views');
      fraudScore += BOT_VIEWS_SCORE;
    }
  }

  if (creatorIds.length === 0) {
    return { fraudScore: Math.min(100, fraudScore), signals };
  }

  const creators = creatorIds.map((id) => (typeof id === 'string' ? id : String(id)));
  const deviceRows = await db.DeviceFingerprint.find({ userId: { $in: creators } })
    .select('userId fingerprint ip')
    .lean();

  // 2. Same IP uploads: many creators using this sound from same IP
  const byIp = new Map();
  for (const row of deviceRows) {
    const ip = row.ip || '__none__';
    if (!byIp.has(ip)) byIp.set(ip, new Set());
    byIp.get(ip).add(String(row.userId));
  }
  for (const [, userIds] of byIp) {
    if (userIds.size >= SAME_IP_MIN_CREATORS) {
      signals.push('same_ip_uploads');
      fraudScore += SAME_IP_SCORE;
      break;
    }
  }

  // 3. Coordinated accounts: same device (fingerprint) used by many creators using this sound
  const byFingerprint = new Map();
  for (const row of deviceRows) {
    const fp = row.fingerprint || '__none__';
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, new Set());
    byFingerprint.get(fp).add(String(row.userId));
  }
  for (const [, userIds] of byFingerprint) {
    if (userIds.size >= COORDINATED_MIN_ACCOUNTS) {
      signals.push('coordinated_accounts');
      fraudScore += COORDINATED_SCORE;
      break;
    }
  }

  // 4. Rapid reuse from same device: many videos with this sound from same fingerprint in 24h
  const windowStart = new Date(Date.now() - RAPID_REUSE_WINDOW_MS);
  const recentVideoSounds = await db.VideoSound.find({
    soundId,
    createdAt: { $gte: windowStart },
  })
    .select('creatorId createdAt')
    .lean();

  if (recentVideoSounds.length >= RAPID_REUSE_MIN_COUNT) {
    const creatorToFingerprint = new Map();
    for (const row of deviceRows) {
      creatorToFingerprint.set(String(row.userId), row.fingerprint);
    }
    const countByFingerprint = new Map();
    for (const vs of recentVideoSounds) {
      const fp = creatorToFingerprint.get(String(vs.creatorId)) || '__unknown__';
      countByFingerprint.set(fp, (countByFingerprint.get(fp) || 0) + 1);
    }
    for (const [, count] of countByFingerprint) {
      if (count >= RAPID_REUSE_MIN_COUNT) {
        signals.push('rapid_reuse_same_device');
        fraudScore += RAPID_REUSE_SCORE;
        break;
      }
    }
  }

  return { fraudScore: Math.min(100, fraudScore), signals };
}

module.exports = { getSoundFraudScore };
