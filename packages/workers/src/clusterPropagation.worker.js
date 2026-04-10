/**
 * Cross-Cluster Propagation — spread sounds across interest clusters.
 * If a sound performs in one cluster (dance, comedy, fitness, beauty, gaming), test it in others.
 * Architecture: sound → cluster test → expansion.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { connection } = require('./queues');
const db = require('@millo/database');

const CLUSTERS = ['dance', 'comedy', 'fitness', 'beauty', 'gaming', 'general'];
const TRENDING_PREFIX = 'cluster:trending:';
const TEST_PREFIX = 'cluster:test:';
const TOP_PERCENT_FOR_EXPANSION = Number(process.env.CLUSTER_TOP_PERCENT_FOR_EXPANSION) || 20;

function getRedis() {
  const REDIS_URL = process.env.REDIS_URL;
  const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
  return REDIS_URL ? new Redis(REDIS_URL) : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
}

function toCluster(category) {
  const c = (category || 'general').toString().toLowerCase().trim();
  return CLUSTERS.includes(c) ? c : 'general';
}

async function runClusterPropagation() {
  const videoSounds = await db.VideoSound.find({}).select('videoId soundId').lean();
  if (!videoSounds.length) return { updated: 0 };

  const videoIds = [...new Set(videoSounds.map((vs) => vs.videoId))];
  const streams = await db.LiveStream.find({ _id: { $in: videoIds } })
    .select('_id category meta')
    .lean();
  const videoToCluster = new Map();
  for (const s of streams) {
    const cluster = toCluster(s.meta?.category || s.category);
    videoToCluster.set(String(s._id), cluster);
  }

  const bySoundCluster = new Map();
  for (const vs of videoSounds) {
    const cluster = videoToCluster.get(String(vs.videoId)) || 'general';
    const key = `${String(vs.soundId)}:${cluster}`;
    if (!bySoundCluster.has(key)) bySoundCluster.set(key, []);
    bySoundCluster.get(key).push(String(vs.videoId));
  }

  const allVideoIds = [...new Set(videoSounds.map((vs) => vs.videoId))];
  const engagements = await db.ContentEngagement.find({
    contentType: 'stream',
    contentId: { $in: allVideoIds },
  })
    .select('contentId shares completionRate watchTimeSeconds')
    .lean();

  const videoToSound = new Map();
  for (const vs of videoSounds) videoToSound.set(String(vs.videoId), String(vs.soundId));

  const scoreByKey = new Map();
  for (const e of engagements) {
    const sid = videoToSound.get(String(e.contentId));
    if (!sid) continue;
    const cluster = videoToCluster.get(String(e.contentId)) || 'general';
    const key = `${sid}:${cluster}`;
    if (!bySoundCluster.has(key)) continue;
    if (!scoreByKey.has(key)) scoreByKey.set(key, { shares: 0, completionSum: 0, n: 0, watchSum: 0 });
    const o = scoreByKey.get(key);
    o.shares += e.shares || 0;
    if (e.completionRate != null) {
      o.completionSum += e.completionRate;
      o.n += 1;
    }
    o.watchSum += e.watchTimeSeconds || 0;
  }

  const clusterScores = new Map();
  for (const [key, videoIdsList] of bySoundCluster) {
    const [soundId, cluster] = key.split(':');
    const scoreData = scoreByKey.get(key) || { shares: 0, completionSum: 0, n: 0, watchSum: 0 };
    const video_uses = videoIdsList.length;
    const completion = scoreData.n > 0 ? scoreData.completionSum / scoreData.n : 0;
    const watchMin = scoreData.watchSum / 60 / Math.max(1, video_uses);
    const score = video_uses * 3 + scoreData.shares * 4 + watchMin * 2 + completion * 50;
    if (!clusterScores.has(cluster)) clusterScores.set(cluster, []);
    clusterScores.get(cluster).push({ soundId, score: Math.round(score * 100) / 100 });
  }

  const redis = getRedis();
  try {
    for (const cluster of CLUSTERS) {
      const list = (clusterScores.get(cluster) || []).sort((a, b) => b.score - a.score);
      const key = `${TRENDING_PREFIX}${cluster}`;
      await redis.del(key);
      if (list.length > 0) {
        const args = list.flatMap(({ soundId, score }) => [score, soundId]);
        await redis.zadd(key, ...args);
      }
    }

    for (const clusterB of CLUSTERS) {
      await redis.del(`${TEST_PREFIX}${clusterB}`);
      for (const clusterA of CLUSTERS) {
        if (clusterA === clusterB) continue;
        const listA = (clusterScores.get(clusterA) || []).sort((a, b) => b.score - a.score);
        const topCount = Math.max(1, Math.ceil(listA.length * (TOP_PERCENT_FOR_EXPANSION / 100)));
        const topInA = listA.slice(0, topCount).map((x) => x.soundId);
        for (const soundId of topInA) await redis.sadd(`${TEST_PREFIX}${clusterB}`, soundId);
      }
    }

    return { updated: CLUSTERS.length };
  } finally {
    redis.disconnect();
  }
}

const worker = new Worker(
  'cluster-propagation',
  async () => runClusterPropagation(),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[clusterPropagation-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, runClusterPropagation, CLUSTERS, TRENDING_PREFIX, TEST_PREFIX };
