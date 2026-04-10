/**
 * Early Viral Detection — watch first 50–500 videos per sound.
 * Signals: average watch time, rewatches (view proxy), shares, comment rate, sound reuse rate.
 * If early viral score exceeds threshold → sound enters viral_sound_candidates (Redis).
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { connection } = require('./queues');
const mongoose = require('mongoose');
const db = require('@millo/database');

const CANDIDATES_KEY = 'viral_sound_candidates';
const { getSoundFraudScore } = require('./lib/soundFraud');

const SOUND_FRAUD_THRESHOLD = Number(process.env.SOUND_FRAUD_THRESHOLD) || 60;

const EARLY_WINDOW_MIN = Number(process.env.EARLY_VIRAL_WINDOW_MIN) || 50;
const EARLY_WINDOW_MAX = Number(process.env.EARLY_VIRAL_WINDOW_MAX) || 500;
const EARLY_VIRAL_THRESHOLD = Number(process.env.EARLY_VIRAL_THRESHOLD) || 0.45;
const CREATOR_DIVERSITY_MIN = Number(process.env.CREATOR_DIVERSITY_MIN) || 20;
const COMPLETION_RATE_MIN = Number(process.env.COMPLETION_RATE_MIN) || 0.7;
const LOOP_RATE_THRESHOLD = Number(process.env.LOOP_RATE_THRESHOLD) || 1.2;
const LOOP_RATE_BOOST_EARLY = Number(process.env.LOOP_RATE_BOOST_EARLY) || 0.25;
/** Sound seeding: algorithm boosts early uses of sounds with seed_priority (platform partners, popular creators, brand campaigns). */
const SEED_PRIORITY_BOOST_EARLY = Number(process.env.SEED_PRIORITY_BOOST_EARLY) || 0.15;

const WEIGHTS = {
  avg_watch_time: 0.25,
  rewatch_proxy: 0.15,
  shares: 0.25,
  comment_rate: 0.2,
  sound_reuse_rate: 0.15,
};

function getRedis() {
  const REDIS_URL = process.env.REDIS_URL;
  const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
  return REDIS_URL ? new Redis(REDIS_URL) : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
}

/**
 * Get first N videos per sound (by VideoSound createdAt). Returns Map<soundId, [{ videoId, createdAt, creatorId }]>.
 */
async function getEarlyWindowPerSound() {
  const all = await db.VideoSound.find({})
    .select('soundId videoId creatorId createdAt')
    .sort({ soundId: 1, createdAt: 1 })
    .lean();
  const bySound = new Map();
  for (const vs of all) {
    const sid = String(vs.soundId);
    if (!bySound.has(sid)) bySound.set(sid, []);
    const arr = bySound.get(sid);
    if (arr.length < EARLY_WINDOW_MAX) arr.push({ videoId: String(vs.videoId), createdAt: vs.createdAt, creatorId: vs.creatorId ? String(vs.creatorId) : null });
  }
  return bySound;
}

/**
 * Compute early viral score 0–1 from signals. If score >= threshold, sound is a viral candidate.
 */
function computeEarlyViralScore(signals) {
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const avgWatchNorm = clamp(signals.avg_watch_time_minutes / 2);
  const rewatchNorm = signals.view_count > 0 ? clamp((signals.view_count - signals.completed_views) / signals.view_count) : 0;
  const sharesNorm = clamp(signals.shares / 50);
  const commentRateNorm = clamp((signals.comment_rate || 0) * 10);
  const reuseNorm = clamp(signals.video_uses_per_day / 5);

  return (
    avgWatchNorm * WEIGHTS.avg_watch_time +
    rewatchNorm * WEIGHTS.rewatch_proxy +
    sharesNorm * WEIGHTS.shares +
    commentRateNorm * WEIGHTS.comment_rate +
    reuseNorm * WEIGHTS.sound_reuse_rate
  );
}

async function runEarlyViralDetection() {
  const bySound = await getEarlyWindowPerSound();
  const seedPriorityIds = new Set(
    (await db.MusicTrack.find({ _id: { $in: [...bySound.keys()] }, seedPriority: true }).select('_id').lean()).map((t) => String(t._id))
  );

  const candidates = [];

  for (const [soundId, videos] of bySound) {
    if (videos.length < EARLY_WINDOW_MIN) continue;

    const unique_creator_count = new Set(videos.map((v) => v.creatorId).filter(Boolean)).size;
    if (unique_creator_count < CREATOR_DIVERSITY_MIN) continue;

    const videoIds = videos.map((v) => v.videoId);
    const firstAt = videos[0]?.createdAt ? new Date(videos[0].createdAt) : new Date();
    const daysSinceFirst = Math.max(0.01, (Date.now() - firstAt.getTime()) / (24 * 60 * 60 * 1000));
    const video_uses_per_day = videoIds.length / daysSinceFirst;

    const contentIds = videoIds.map((id) => new mongoose.Types.ObjectId(id));
    const engagements = await db.ContentEngagement.find({
      contentType: 'stream',
      contentId: { $in: contentIds },
    })
      .select('contentId watchTimeSeconds viewCount playCount completedViews shares comments')
      .lean();

    let watchSum = 0;
    let watchCount = 0;
    let viewCount = 0;
    let totalPlays = 0;
    let completedViews = 0;
    let shares = 0;
    let comments = 0;
    for (const e of engagements) {
      if (e.watchTimeSeconds != null && e.watchTimeSeconds > 0) {
        watchSum += e.watchTimeSeconds;
        watchCount += 1;
      }
      viewCount += e.viewCount || 0;
      totalPlays += (e.playCount != null && e.playCount > 0) ? e.playCount : (e.viewCount || 0);
      completedViews += e.completedViews || 0;
      shares += e.shares || 0;
      comments += e.comments || 0;
    }

    const avg_watch_time_minutes = watchCount > 0 ? watchSum / watchCount / 60 : 0;
    const comment_rate = viewCount > 0 ? comments / viewCount : 0;
    const completion_rate = viewCount > 0 ? completedViews / viewCount : 0;
    if (viewCount >= 10 && completion_rate < COMPLETION_RATE_MIN) continue;

    const loop_rate = viewCount > 0 ? totalPlays / viewCount : 1;
    let score = computeEarlyViralScore({
      avg_watch_time_minutes,
      view_count: viewCount,
      completed_views: completedViews,
      shares,
      comment_rate,
      video_uses_per_day,
    });
    if (loop_rate > LOOP_RATE_THRESHOLD) score = Math.min(1, score + LOOP_RATE_BOOST_EARLY);
    if (seedPriorityIds.has(soundId)) score = Math.min(1, score + SEED_PRIORITY_BOOST_EARLY);

    const creatorIds = [...new Set(videos.map((v) => v.creatorId).filter(Boolean))];
    const { fraudScore } = await getSoundFraudScore(soundId, {
      videoIds,
      creatorIds,
      totalViews: viewCount,
      watchTimeSum: watchSum,
    });
    if (fraudScore >= SOUND_FRAUD_THRESHOLD) continue;

    if (score >= EARLY_VIRAL_THRESHOLD) {
      candidates.push({ soundId, score: Math.round(score * 1000) / 1000 });
    }
  }

  const redis = getRedis();
  try {
    await redis.del(CANDIDATES_KEY);
    if (candidates.length > 0) {
      const args = candidates.flatMap(({ soundId, score }) => [score, soundId]);
      await redis.zadd(CANDIDATES_KEY, ...args);
    }
    return { updated: candidates.length, candidates: candidates.length };
  } finally {
    redis.disconnect();
  }
}

const earlyViralQueueName = 'early-viral-detection';
const worker = new Worker(
  earlyViralQueueName,
  async (job) => runEarlyViralDetection(),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[earlyViralDetection-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, runEarlyViralDetection, CANDIDATES_KEY };
