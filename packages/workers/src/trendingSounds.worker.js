/**
 * Viral Sound Engine — dynamic viral score per sound. Sounds compete; high-scoring sounds get pushed.
 * score = (video_uses × 3) + (shares × 4) + (avg_watch_time × 5) + (completion_rate × 4) + (creator_diversity × 2) + (adoption_rate × 6)
 * adoption_rate = new_videos_using_sound per hour; high adoption triggers algorithm amplification.
 * Updates Redis ZSET trending_sounds (score = viral_score) every 5 minutes.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { connection, trendingSoundsQueue } = require('./queues');
const db = require('@millo/database');
const { getSoundFraudScore } = require('./lib/soundFraud');

const TRENDING_KEY = 'trending_sounds';

/** Geographic trend boost: regional leaderboard keys (trending_sounds_us, trending_sounds_brazil, etc.). */
const TRENDING_REGION_PREFIX = 'trending_sounds_';
const TRENDING_REGIONS = [
  { code: 'US', slug: 'us' },
  { code: 'BR', slug: 'brazil' },
  { code: 'IN', slug: 'india' },
  { code: 'UK', slug: 'uk' },
  { code: 'EU', slug: 'eu' },
];
function codeToRegionSlug(code) {
  const c = (code || '').toString().toUpperCase().trim();
  const r = TRENDING_REGIONS.find((x) => x.code === c);
  return r ? r.slug : null;
}

const WEIGHTS = {
  video_uses: 3,
  shares: 4,
  avg_watch_time: 5,
  completion_rate: 4,
  creator_diversity: 2,
  adoption_rate: 6,
};

/** Minimum unique creators using a sound for it to enter the leaderboard (prevents one creator from gaming). */
const CREATOR_DIVERSITY_MIN = Number(process.env.CREATOR_DIVERSITY_MIN) || 20;
/** Minimum completion rate (0–1) for a sound to get exposure. TikTok heavily weights watch completion; default 0.7 = 70%. */
const COMPLETION_RATE_MIN = Number(process.env.COMPLETION_RATE_MIN) || 0.7;
/** Loop rate > this indicates rewatch behavior; sound gets a massive ranking boost. loop_rate = total_plays / total_views. */
const LOOP_RATE_THRESHOLD = Number(process.env.LOOP_RATE_THRESHOLD) || 1.2;
const LOOP_RATE_BOOST_WEIGHT = Number(process.env.LOOP_RATE_BOOST_WEIGHT) || 80;
/** Sound seeding: internal flag seed_priority = true; algorithm boosts these early uses (platform partners, popular creators, brand campaigns). */
const SEED_PRIORITY_BOOST = Number(process.env.SEED_PRIORITY_BOOST) || 100;

function getRedis() {
  const REDIS_URL = process.env.REDIS_URL;
  const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
  return REDIS_URL ? new Redis(REDIS_URL) : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
}

/**
 * Viral Sound Worker Example — get metrics for a single sound (for single-sound score update or tests).
 * Returns { videoUses, shares, watchTime, completionRate, uniqueCreators }.
 */
async function getSoundMetrics(soundId) {
  const videoSounds = await db.VideoSound.find({ soundId }).select('videoId creatorId').lean();
  if (!videoSounds.length) {
    return { videoUses: 0, shares: 0, watchTime: 0, completionRate: 0, uniqueCreators: 0 };
  }
  const videoIds = videoSounds.map((vs) => vs.videoId);
  const uniqueCreators = new Set(videoSounds.map((vs) => vs.creatorId).filter(Boolean)).size;
  const engagements = await db.ContentEngagement.find({
    contentType: 'stream',
    contentId: { $in: videoIds },
  })
    .select('shares watchTimeSeconds completionRate')
    .lean();
  let shares = 0;
  let watchTimeSum = 0;
  let watchCount = 0;
  let completionSum = 0;
  let completionCount = 0;
  for (const e of engagements) {
    shares += e.shares || 0;
    if (e.watchTimeSeconds != null && e.watchTimeSeconds > 0) {
      watchTimeSum += e.watchTimeSeconds;
      watchCount += 1;
    }
    if (e.completionRate != null) {
      completionSum += e.completionRate;
      completionCount += 1;
    }
  }
  const watchTime = watchCount > 0 ? watchTimeSum / watchCount / 60 : 0;
  const completionRate = completionCount > 0 ? completionSum / completionCount : 0;
  return {
    videoUses: videoIds.length,
    shares,
    watchTime,
    completionRate,
    uniqueCreators,
  };
}

/**
 * Viral Sound Worker Example — update a single sound's score in the trending leaderboard.
 * score = videoUses*3 + shares*4 + watchTime*5 + completionRate*4 + uniqueCreators*2
 * Worker runs every 5 minutes (batch job); this helper can be used for on-demand single-sound updates.
 */
async function updateSoundScore(soundId) {
  const metrics = await getSoundMetrics(soundId);
  const score =
    metrics.videoUses * 3 +
    metrics.shares * 4 +
    metrics.watchTime * 5 +
    metrics.completionRate * 4 +
    metrics.uniqueCreators * 2;
  const redis = getRedis();
  try {
    await redis.zadd(TRENDING_KEY, score, String(soundId));
    return { soundId, score };
  } finally {
    redis.disconnect();
  }
}

/**
 * Compute per-sound viral score:
 * (video_uses × 3) + (shares × 4) + (avg_watch_time × 5) + (completion_rate × 4) + (creator_diversity × 2) + (adoption_rate × 6)
 * - adoption_rate: new_videos_using_sound in the last 1 hour; high adoption triggers algorithm amplification.
 */
async function computeTrendingScores() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [videoSounds, adoptionCounts] = await Promise.all([
    db.VideoSound.find({}).select('videoId soundId creatorId').lean(),
    db.VideoSound.aggregate([
      { $match: { createdAt: { $gte: oneHourAgo } } },
      { $group: { _id: '$soundId', count: { $sum: 1 } } },
    ]),
  ]);
  if (!videoSounds.length) return [];

  const adoptionRateBySound = new Map();
  for (const row of adoptionCounts || []) {
    adoptionRateBySound.set(String(row._id), row.count || 0);
  }

  const bySound = new Map();
  const creatorIdsBySound = new Map();
  for (const vs of videoSounds) {
    const sid = String(vs.soundId);
    if (!bySound.has(sid)) {
      bySound.set(sid, []);
      creatorIdsBySound.set(sid, new Set());
    }
    bySound.get(sid).push(String(vs.videoId));
    if (vs.creatorId) creatorIdsBySound.get(sid).add(String(vs.creatorId));
  }

  const allVideoIds = [...new Set(videoSounds.map((vs) => vs.videoId))];
  const engagements = await db.ContentEngagement.find({
    contentType: 'stream',
    contentId: { $in: allVideoIds },
  })
    .select('contentId likes shares completionRate watchTimeSeconds viewCount playCount regionCounts')
    .lean();

  const videoToSound = new Map();
  for (const vs of videoSounds) {
    videoToSound.set(String(vs.videoId), String(vs.soundId));
  }

  const soundEng = new Map();
  const soundRegionViews = new Map();
  for (const sid of bySound.keys()) {
    soundRegionViews.set(sid, new Map());
  }
  for (const e of engagements) {
    const sid = videoToSound.get(String(e.contentId));
    if (!sid) continue;
    if (!soundEng.has(sid)) {
      soundEng.set(sid, {
        shares: 0,
        completionSum: 0,
        completionCount: 0,
        watchTimeSum: 0,
        watchTimeCount: 0,
        totalPlays: 0,
        totalViews: 0,
      });
    }
    const o = soundEng.get(sid);
    o.shares += e.shares || 0;
    if (e.completionRate != null) {
      o.completionSum += e.completionRate;
      o.completionCount += 1;
    }
    if (e.watchTimeSeconds != null && e.watchTimeSeconds > 0) {
      o.watchTimeSum += e.watchTimeSeconds;
      o.watchTimeCount += 1;
    }
    o.totalPlays += e.playCount != null && e.playCount > 0 ? e.playCount : (e.viewCount || 0);
    o.totalViews += e.viewCount || 0;
    const regionMap = soundRegionViews.get(sid);
    if (regionMap && e.regionCounts && typeof e.regionCounts === 'object') {
      for (const [code, val] of Object.entries(e.regionCounts)) {
        const slug = codeToRegionSlug(code);
        if (!slug) continue;
        const views = typeof val === 'number' ? val : (val && (val.views ?? val.viewCount)) || 0;
        regionMap.set(slug, (regionMap.get(slug) || 0) + views);
      }
    }
  }

  const seedPriorityIds = new Set(
    (await db.MusicTrack.find({ _id: { $in: [...bySound.keys()] }, seedPriority: true }).select('_id').lean()).map((t) => String(t._id))
  );

  const scores = [];
  for (const [soundId, videoIds] of bySound) {
    const video_uses = videoIds.length;
    const eng = soundEng.get(soundId) || {
      shares: 0,
      completionSum: 0,
      completionCount: 0,
      watchTimeSum: 0,
      watchTimeCount: 0,
      totalPlays: 0,
      totalViews: 0,
    };
    const completion_rate = eng.completionCount > 0 ? eng.completionSum / eng.completionCount : 0;
    const avg_watch_time_minutes =
      eng.watchTimeCount > 0 ? eng.watchTimeSum / eng.watchTimeCount / 60 : 0;
    const creator_diversity = (creatorIdsBySound.get(soundId) || new Set()).size;
    const adoption_rate = adoptionRateBySound.get(soundId) || 0;

    if (creator_diversity < CREATOR_DIVERSITY_MIN) continue;
    if (eng.completionCount > 0 && completion_rate < COMPLETION_RATE_MIN) continue;

    const total_views = eng.totalViews || 0;
    const total_plays = eng.totalPlays || 0;
    const loop_rate = total_views > 0 ? total_plays / total_views : 1;
    const loop_boost = loop_rate > LOOP_RATE_THRESHOLD ? (loop_rate - 1) * LOOP_RATE_BOOST_WEIGHT : 0;
    const seed_boost = seedPriorityIds.has(soundId) ? SEED_PRIORITY_BOOST : 0;

    const { fraudScore, signals: fraudSignals } = await getSoundFraudScore(soundId, {
      videoIds: [...videoIds],
      creatorIds: [...(creatorIdsBySound.get(soundId) || [])],
      totalViews: eng.totalViews || 0,
      watchTimeSum: eng.watchTimeSum || 0,
    });
    if (fraudScore >= SOUND_FRAUD_THRESHOLD) {
      try {
        await db.FraudEvent.create({
          eventType: 'sound_gaming',
          action: 'block',
          riskScore: fraudScore,
          signals: fraudSignals,
          provider: 'internal',
          refType: 'sound',
          refId: soundId,
          meta: { videoCount: videoIds.length, creatorCount: (creatorIdsBySound.get(soundId) || new Set()).size },
        });
      } catch (_) { /* ignore audit log errors */ }
      continue;
    }

    const sound_score =
      video_uses * WEIGHTS.video_uses +
      eng.shares * WEIGHTS.shares +
      avg_watch_time_minutes * WEIGHTS.avg_watch_time +
      completion_rate * WEIGHTS.completion_rate +
      creator_diversity * WEIGHTS.creator_diversity +
      adoption_rate * WEIGHTS.adoption_rate +
      loop_boost +
      seed_boost;

    scores.push({ soundId, score: Math.round(sound_score * 100) / 100 });
  }
  const sortedScores = scores.sort((a, b) => b.score - a.score);
  return { scores: sortedScores, soundRegionViews };
}

async function updateTrendingLeaderboard() {
  const { scores, soundRegionViews } = await computeTrendingScores();
  const redis = getRedis();
  try {
    await redis.del(TRENDING_KEY);
    if (scores.length > 0) {
      const args = scores.flatMap(({ soundId, score }) => [score, soundId]);
      await redis.zadd(TRENDING_KEY, ...args);
    }
    for (const region of TRENDING_REGIONS) {
      const key = `${TRENDING_REGION_PREFIX}${region.slug}`;
      const withRegion = scores
        .map((s) => ({ soundId: s.soundId, regionalScore: soundRegionViews.get(s.soundId)?.get(region.slug) || 0 }))
        .filter((s) => s.regionalScore > 0)
        .sort((a, b) => b.regionalScore - a.regionalScore);
      await redis.del(key);
      if (withRegion.length > 0) {
        const regionArgs = withRegion.flatMap((s) => [s.regionalScore, s.soundId]);
        await redis.zadd(key, ...regionArgs);
      }
    }
    return { updated: scores.length };
  } finally {
    redis.disconnect();
  }
}

const worker = new Worker(
  'trending-sounds',
  async (job) => {
    const result = await updateTrendingLeaderboard();
    return result;
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[trendingSounds-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, updateTrendingLeaderboard, computeTrendingScores, getSoundMetrics, updateSoundScore };
