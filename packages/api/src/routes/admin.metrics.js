'use strict';
/**
 * Admin metrics API — Fastify (not Express). Same intent as a mounted router at `/admin/metrics`:
 *
 * | Express-style sketch              | Millo route                         |
 * |----------------------------------|-------------------------------------|
 * | GET `/overview`                  | GET `/admin/metrics/overview`       |
 * | GET `/queues` (3 waiting counts) | GET `/admin/metrics/queues/ops`     |
 *
 * Waiting counts use BullMQ (`../lib/redis` connection), not raw Redis `LLEN`.
 * Full per-queue dashboard (names, waiting/active/failed, …) is GET `/admin/metrics/queues`
 * in `dashboards.js` → `getAdminMetricsQueues()` — do not conflate with `/queues/ops`.
 * System / payments / live / queues JSON: GET `/admin/metrics/system|payments|live|queues` (dashboardsRoutes, admin|ops guard).
 * Full merged snapshot: GET `/admin/metrics/observability`.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { Queue } = require('bullmq');
const { getBullMqConnection } = require('../lib/redis');
const { requireAdmin } = require('../middleware/adminAuth');
const {
  getQueueSize,
  getActiveStreams,
} = require('./metrics');

async function getUserCount() {
  try {
    return await db.User.countDocuments({});
  } catch {
    return null;
  }
}

/** Sum positive ledger amounts in the last 24h (platform financial audit). */
async function getRevenue24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const agg = await db.FinancialAuditLog.aggregate([
      { $match: { createdAt: { $gte: since }, amountCents: { $gt: 0 } } },
      { $group: { _id: null, totalCents: { $sum: '$amountCents' } } },
    ]);
    return agg[0]?.totalCents ?? 0;
  } catch {
    return null;
  }
}

/** Logical labels → BullMQ queue names (workers package). */
const QUEUE_BY_LABEL = {
  video: 'video-processing',
  moderation: 'bot-detection',
  email: 'email',
};

/**
 * @param {'video'|'moderation'|'email'} label
 * @returns {Promise<number|null>} waiting job count
 */
async function getQueueSizeForLabel(label) {
  const name = QUEUE_BY_LABEL[label];
  if (!name) return null;
  const q = new Queue(name, { connection: getBullMqConnection() });
  try {
    const counts = await q.getJobCounts('waiting');
    return Number(counts.waiting || 0);
  } catch {
    return null;
  } finally {
    await q.close().catch(() => {});
  }
}

/** Same shape as a tutorial `GET /queues` with getQueueSize("video"|"moderation"|"email"). */
async function getQueuesOpsPayload() {
  const [videoProcessing, moderation, emails] = await Promise.all([
    getQueueSizeForLabel('video'),
    getQueueSizeForLabel('moderation'),
    getQueueSizeForLabel('email'),
  ]);
  return {
    videoProcessing,
    moderation,
    emails,
    generatedAt: new Date().toISOString(),
  };
}

async function getOverviewPayload() {
  const [users, activeStreams, revenue24h, queueJobs] = await Promise.all([
    getUserCount(),
    getActiveStreams(),
    getRevenue24h(),
    getQueueSize(),
  ]);
  return {
    users,
    activeStreams,
    revenue24h,
    queueJobs,
    generatedAt: new Date().toISOString(),
  };
}

async function adminMetricsRoutes(app) {
  app.get('/admin/metrics/overview', { preHandler: requireAdmin }, async (request, reply) => {
    return reply.send(await getOverviewPayload());
  });

  app.get('/admin/metrics/queues/ops', { preHandler: requireAdmin }, async (request, reply) => {
    return reply.send(await getQueuesOpsPayload());
  });
}

module.exports = { adminMetricsRoutes, getOverviewPayload, getQueuesOpsPayload };
