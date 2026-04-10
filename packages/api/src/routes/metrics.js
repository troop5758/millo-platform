'use strict';
/**
 * Prometheus metrics endpoint — /metrics for infrastructure scraping.
 * HTTP request counters and duration for alerting (HighErrorRate, SlowAPI).
 * Feed product KPIs (Part 10): `millo_feed_kpi_*` from `recordFeedKpiFromFeedEvent` (POST /feed/events/*).
 *
 * Observability stack: Prometheus scrapes `GET /metrics`; Grafana (infra/monitoring) uses Prometheus; Sentry when `SENTRY_DSN`.
 * Admin JSON: `GET /admin/metrics` (summary + stack), `GET /admin/metrics/system|queues|payments|live`, `GET /admin/metrics/observability` (full merge).
 * Aliases under `/dashboards/admin/metrics/*`. RBAC: admin or ops (dashboards.hasRole).
 * https://milloapp.com
 */
const client = require('prom-client');
const { Queue } = require('bullmq');
const { mongoose } = require('@millo/database');
const { getBullMqConnection, redis } = require('../lib/redis');

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'millo_' });

const httpRequestsTotal = new client.Counter({
  name: 'millo_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new client.Histogram({
  name: 'millo_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const paymentErrorsTotal = new client.Counter({
  name: 'millo_payment_errors_total',
  help: 'Total payment endpoint errors',
  labelNames: ['route', 'status'],
});

const queueDepth = new client.Gauge({
  name: 'millo_queue_depth',
  help: 'Queue depth by queue and state',
  labelNames: ['queue', 'state'],
});

const workerFailures = new client.Gauge({
  name: 'millo_worker_failures',
  help: 'Failed jobs count by queue',
  labelNames: ['queue'],
});

/** Time from POST /live/start until stream + optional Janus room ready (ms). */
const streamLatencyMs = new client.Histogram({
  name: 'millo_stream_latency_ms',
  help: 'Live go-live path latency in milliseconds (API: startStream + Janus)',
  buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

/** Concurrent streams reported by API (inc on start, dec on end). */
const activeStreams = new client.Gauge({
  name: 'millo_active_streams',
  help: 'Number of active live streams (gauge maintained on start/end)',
});

/** Successful gift settlements via POST /content/gifts/send. Use rate(...[1m]) for per-second. */
const giftTransactionsTotal = new client.Counter({
  name: 'millo_gift_transactions_total',
  help: 'Total completed gift transactions (HTTP gifts/send)',
  labelNames: ['source'],
});

/** Application-level Redis cache observations (e.g. feed cache). */
const redisCacheHitsTotal = new client.Counter({
  name: 'millo_redis_cache_hits_total',
  help: 'Redis-backed cache hits at application layer',
  labelNames: ['layer'],
});

const redisCacheMissesTotal = new client.Counter({
  name: 'millo_redis_cache_misses_total',
  help: 'Redis-backed cache misses at application layer',
  labelNames: ['layer'],
});

/** For You pipeline — latency and stage sizes (Part 17). */
const feedBuildDurationSeconds = new client.Histogram({
  name: 'millo_feed_build_duration_seconds',
  help: 'Wall time for buildForYouFeed (candidate → business rules)',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const feedCandidatesBeforeFilter = new client.Histogram({
  name: 'millo_feed_candidates_before_filter',
  help: 'Candidate count after retrieval merge (before policy filter)',
  buckets: [0, 5, 10, 25, 50, 100, 200, 400, 800],
});

const feedCandidatesAfterFilter = new client.Histogram({
  name: 'millo_feed_candidates_after_filter',
  help: 'Candidate count after policy filter',
  buckets: [0, 5, 10, 25, 50, 100, 200, 400],
});

const feedItemsBeforeBusinessRules = new client.Histogram({
  name: 'millo_feed_items_before_business_rules',
  help: 'Slate size before applyBusinessRules',
  buckets: [0, 5, 10, 20, 50, 80, 120],
});

const feedOutputItems = new client.Histogram({
  name: 'millo_feed_output_items',
  help: 'Final item count returned to client',
  buckets: [0, 5, 10, 20, 50, 80, 120],
});

const feedItemFinalScore = new client.Histogram({
  name: 'millo_feed_item_final_score',
  help: 'Heuristic finalScore per item in served slate',
  buckets: [-2, 0, 0.5, 1, 1.5, 2, 3, 5, 8, 12],
});

const feedDistinctCreatorsRatio = new client.Histogram({
  name: 'millo_feed_distinct_creators_ratio',
  help: 'Distinct creators / items in slate (diversity proxy)',
  buckets: [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1],
});

const feedCreatorHhi = new client.Histogram({
  name: 'millo_feed_creator_hhi',
  help: 'Herfindahl index on creator shares in slate (lower = more diverse)',
  buckets: [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1],
});

const feedBuildsTotal = new client.Counter({
  name: 'millo_feed_builds_total',
  help: 'For You feed builds completed',
  labelNames: ['cold_user', 'experiment_bucket'],
});

/** Part 10 — Product KPIs from POST /feed/events/* (Grafana: rates, ratios vs impressions). */
const feedKpiImpressionsTotal = new client.Counter({
  name: 'millo_feed_kpi_impressions_total',
  help: 'Feed card impressions (denominator for CTR)',
  labelNames: ['source'],
});

const feedKpiPlaysTotal = new client.Counter({
  name: 'millo_feed_kpi_plays_total',
  help: 'Feed play starts (CTR numerator: impression → play)',
  labelNames: ['source'],
});

const feedKpiCompletionsTotal = new client.Counter({
  name: 'millo_feed_kpi_completions_total',
  help: 'Feed watch completions (completion rate numerator)',
  labelNames: ['source'],
});

/** Watch time (primary): seconds summed on `complete` events only (terminal watchTimeMs per client). */
const feedKpiWatchTimeSecondsTotal = new client.Counter({
  name: 'millo_feed_kpi_watch_time_seconds_total',
  help: 'Cumulative watch seconds from completed views (complete event watchTimeMs / 1000)',
  labelNames: ['source'],
});

const feedKpiWatchMilestonesTotal = new client.Counter({
  name: 'millo_feed_kpi_watch_milestones_total',
  help: 'Qualified watch depth events (watch_2s / watch_6s / watch_15s)',
  labelNames: ['source', 'milestone'],
});

const feedKpiCompletionDurationSeconds = new client.Histogram({
  name: 'millo_feed_kpi_completion_duration_seconds',
  help: 'Reported watch duration at complete (seconds)',
  labelNames: ['source'],
  buckets: [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600],
});

const feedKpiReportedWatchDepthSeconds = new client.Histogram({
  name: 'millo_feed_kpi_reported_watch_depth_seconds',
  help: 'Cumulative seconds reported at watch milestones (client-reported)',
  labelNames: ['source', 'milestone'],
  buckets: [1, 2, 5, 10, 15, 30, 60, 120, 300, 600],
});

const QUEUE_NAMES = [
  'trust-decay',
  'payout-retry',
  'payment-deadline',
  'scheduled-streams',
  'stream-reminder',
  'live-events',
  'dm-timeout',
  'fraud-check',
  'bot-detection',
  'composition',
  'video-processing',
  'notifications',
];

let _queues = null;

function getQueues() {
  if (_queues) return _queues;
  const connection = getBullMqConnection();
  _queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  return _queues;
}

async function refreshQueueMetrics() {
  const queues = getQueues();
  for (const q of queues) {
    try {
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
      queueDepth.set({ queue: q.name, state: 'waiting' }, Number(counts.waiting || 0));
      queueDepth.set({ queue: q.name, state: 'active' }, Number(counts.active || 0));
      queueDepth.set({ queue: q.name, state: 'delayed' }, Number(counts.delayed || 0));
      queueDepth.set({ queue: q.name, state: 'paused' }, Number(counts.paused || 0));
      queueDepth.set({ queue: q.name, state: 'completed' }, Number(counts.completed || 0));
      queueDepth.set({ queue: q.name, state: 'failed' }, Number(counts.failed || 0));
      workerFailures.set({ queue: q.name }, Number(counts.failed || 0));
    } catch {
      // Queue/Redis may be unavailable; keep metrics scrape healthy
    }
  }
}

/** PATCH 18 — aggregate backlog: total `waiting` jobs across configured BullMQ queues. */
async function getQueueSize() {
  const dash = await getQueueDashboard();
  let total = 0;
  for (const q of dash) {
    if (typeof q.waiting === 'number') total += q.waiting;
  }
  return total;
}

/** PATCH 18 — live streams from Mongo (status `live`). */
async function getActiveStreams() {
  try {
    const db = require('@millo/database');
    return await db.LiveStream.countDocuments({ status: 'live' });
  } catch {
    return null;
  }
}

/** PATCH 18 — payment-related Prometheus counters (same signals as admin metrics payments). */
async function getPaymentStats() {
  await refreshQueueMetrics();
  return {
    paymentErrors: metricGetJson(paymentErrorsTotal),
    giftTransactions: metricGetJson(giftTransactionsTotal),
  };
}

/**
 * PATCH 18 — single admin payload: queue backlog, live count, payment counters.
 */
/**
 * Enterprise observability manifest — no secrets (Sentry DSN never exposed).
 * Configure: SENTRY_DSN, GRAFANA_EXTERNAL_URL or MILLO_GRAFANA_URL, APP_VERSION.
 */
function getObservabilityStackSnapshot() {
  const sentryOn = Boolean(process.env.SENTRY_DSN && String(process.env.SENTRY_DSN).trim());
  return {
    sentry: {
      enabled: sentryOn,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.APP_VERSION || undefined,
      notes: 'API initializes @sentry/node when SENTRY_DSN is set (see packages/api/src/index.js).',
    },
    prometheus: {
      scrapePath: '/metrics',
      jobName: process.env.PROMETHEUS_JOB_NAME || 'millo-api',
      stackPath: 'infra/monitoring/docker-compose.yml',
      localUi: 'http://localhost:9090',
    },
    grafana: {
      datasource: 'Prometheus (provisioned)',
      dashboardPath: 'infra/monitoring/grafana/dashboards/millo-observability.json',
      externalUrl: process.env.GRAFANA_EXTERNAL_URL || process.env.MILLO_GRAFANA_URL || null,
      localUi: 'http://localhost:3001',
    },
    adminJsonApis: {
      summary: 'GET /admin/metrics',
      system: 'GET /admin/metrics/system',
      payments: 'GET /admin/metrics/payments',
      live: 'GET /admin/metrics/live',
      queues: 'GET /admin/metrics/queues',
      full: 'GET /admin/metrics/observability',
    },
  };
}

async function getAdminMetricsSummary() {
  const [queueSize, activeStreams, payments] = await Promise.all([
    getQueueSize(),
    getActiveStreams(),
    getPaymentStats(),
  ]);
  return {
    observability: getObservabilityStackSnapshot(),
    queueSize,
    activeStreams,
    payments,
    generatedAt: new Date().toISOString(),
  };
}

/** Single response merging stack metadata + all domain snapshots (full visibility for enterprise dashboards). */
async function getAdminMetricsObservability() {
  const [system, queues, payments, live] = await Promise.all([
    getAdminMetricsSystem(),
    getAdminMetricsQueues(),
    getAdminMetricsPayments(),
    getAdminMetricsLive(),
  ]);
  return {
    observability: getObservabilityStackSnapshot(),
    system,
    queues,
    payments,
    live,
    generatedAt: new Date().toISOString(),
  };
}

/** Queue dashboard: job counts per queue (for admin UI / BullMQ Arena alternative). */
async function getQueueDashboard() {
  const queues = getQueues();
  const result = [];
  for (const q of queues) {
    try {
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
      result.push({
        name: q.name,
        waiting: Number(counts.waiting || 0),
        active: Number(counts.active || 0),
        delayed: Number(counts.delayed || 0),
        failed: Number(counts.failed || 0),
        completed: Number(counts.completed || 0),
        paused: Number(counts.paused || 0),
      });
    } catch (e) {
      result.push({ name: q.name, error: e?.message || 'unavailable' });
    }
  }
  return result;
}

function getRouteLabel(url) {
  const path = (url || '').split('?')[0];
  if (!path) return 'unknown';
  const parts = path.split('/').filter(Boolean);
  return '/' + parts.slice(0, 3).join('/');
}

function registerHttpMetrics(app) {
  app.addHook('onRequest', (request, _reply, done) => {
    request.metricsStartTime = Date.now();
    done();
  });
  app.addHook('onResponse', (request, reply, done) => {
    const method = request.method || 'GET';
    const route = request.routeOptions?.url || getRouteLabel(request.url);
    const status = String(reply.statusCode || 500);
    httpRequestsTotal.inc({ method, route, status });
    const duration = (Date.now() - (request.metricsStartTime || Date.now())) / 1000;
    httpRequestDuration.observe({ method, route, status }, duration);
    if (route.startsWith('/payments') && Number(status) >= 400) {
      paymentErrorsTotal.inc({ route, status });
    }
    done();
  });
}

async function metricsRoutes(app) {
  registerHttpMetrics(app);
  app.get('/metrics', async (_request, reply) => {
    await refreshQueueMetrics();
    reply.header('Content-Type', client.register.contentType);
    return reply.send(await client.register.metrics());
  });
}

/** Safe `.get()` for prom-client metrics (Counter/Gauge/Histogram). */
function metricGetJson(metric) {
  try {
    return metric.get();
  } catch {
    return null;
  }
}

/**
 * Admin JSON: Node process, Mongo/Redis checks, and HTTP counters (same registry as `GET /metrics`).
 */
async function getAdminMetricsSystem() {
  const mem = process.memoryUsage();
  const system = {
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
  };

  let mongo = { ok: false, state: mongoose.connection?.readyState };
  try {
    if (mongoose.connection?.readyState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      mongo = { ok: true, state: mongoose.connection.readyState };
    }
  } catch (e) {
    mongo = { ok: false, state: mongoose.connection?.readyState, error: e.message };
  }

  let redisOk = false;
  let redisError;
  try {
    if (redis && typeof redis.ping === 'function') {
      const pong = await redis.ping();
      redisOk = pong === 'PONG' || pong === true;
    }
  } catch (e) {
    redisError = e.message;
  }

  return {
    source: 'millo-api',
    observability: getObservabilityStackSnapshot(),
    process: system,
    dependencies: {
      mongo,
      redis: { ok: redisOk, error: redisError },
    },
    prometheus: {
      scrapePath: '/metrics',
      job: process.env.PROMETHEUS_JOB_NAME || 'millo-api',
      panels: {
        memoryBytes: 'millo_process_resident_memory_bytes',
        cpuUserSeconds: 'millo_process_cpu_user_seconds_total',
        eventLoopLag: 'millo_nodejs_eventloop_lag_seconds',
      },
    },
    grafana: {
      datasourceType: 'Prometheus',
      panels: [
        { title: 'Process RSS (bytes)', expr: 'millo_process_resident_memory_bytes' },
        { title: 'HTTP requests (rate)', expr: 'sum(rate(millo_http_requests_total[5m])) by (status)' },
      ],
    },
    http: {
      requestsTotal: metricGetJson(httpRequestsTotal),
      requestDurationSeconds: metricGetJson(httpRequestDuration),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Admin dashboard: BullMQ queues + same signals as `millo_queue_depth` / `millo_worker_failures` (Prometheus).
 */
async function getAdminMetricsQueues() {
  await refreshQueueMetrics();
  const queues = await getQueueDashboard();
  return {
    source: 'millo-api',
    observability: getObservabilityStackSnapshot(),
    prometheus: {
      scrapePath: '/metrics',
      job: process.env.PROMETHEUS_JOB_NAME || 'millo-api',
      metricNames: ['millo_queue_depth', 'millo_worker_failures'],
    },
    grafana: {
      datasourceType: 'Prometheus',
      panels: [
        {
          title: 'Queue depth by state',
          expr: 'sum by (queue, state) (millo_queue_depth)',
        },
        {
          title: 'Failed jobs by queue',
          expr: 'millo_worker_failures',
        },
      ],
    },
    queues,
    gauges: {
      queueDepth: metricGetJson(queueDepth),
      workerFailures: metricGetJson(workerFailures),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Admin dashboard: payment-related counters (`millo_payment_errors_total`, `millo_gift_transactions_total`).
 */
async function getAdminMetricsPayments() {
  await refreshQueueMetrics();
  return {
    source: 'millo-api',
    observability: getObservabilityStackSnapshot(),
    prometheus: {
      scrapePath: '/metrics',
      job: process.env.PROMETHEUS_JOB_NAME || 'millo-api',
      metricNames: ['millo_payment_errors_total', 'millo_gift_transactions_total'],
    },
    grafana: {
      datasourceType: 'Prometheus',
      panels: [
        {
          title: 'Payment endpoint errors (rate)',
          expr: 'sum(rate(millo_payment_errors_total[5m])) by (route, status)',
        },
        {
          title: 'Gift transactions (rate)',
          expr: 'sum(rate(millo_gift_transactions_total[5m])) by (source)',
        },
      ],
    },
    counters: {
      paymentErrors: metricGetJson(paymentErrorsTotal),
      giftTransactions: metricGetJson(giftTransactionsTotal),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Admin dashboard: live streaming (`millo_active_streams`, `millo_stream_latency_ms`) + Mongo live count.
 */
async function getAdminMetricsLive() {
  await refreshQueueMetrics();
  let mongoLiveStreams = null;
  let concurrentViewers = null;
  try {
    const db = require('@millo/database');
    mongoLiveStreams = await db.LiveStream.countDocuments({ status: 'live' });
    concurrentViewers = await db.LiveViewer.countDocuments({ leftAt: null });
  } catch {
    mongoLiveStreams = null;
    concurrentViewers = null;
  }
  return {
    source: 'millo-api',
    observability: getObservabilityStackSnapshot(),
    prometheus: {
      scrapePath: '/metrics',
      job: process.env.PROMETHEUS_JOB_NAME || 'millo-api',
      metricNames: ['millo_active_streams', 'millo_stream_latency_ms'],
    },
    grafana: {
      datasourceType: 'Prometheus',
      panels: [
        {
          title: 'Active streams (gauge)',
          expr: 'millo_active_streams',
        },
        {
          title: 'Go-live latency (p95)',
          expr: 'histogram_quantile(0.95, sum(rate(millo_stream_latency_ms_bucket[5m])) by (le))',
        },
      ],
    },
    gauges: {
      activeStreams: metricGetJson(activeStreams),
    },
    histograms: {
      streamLatencyMs: metricGetJson(streamLatencyMs),
    },
    mongoLiveStreams,
    /** Open viewer rows (leftAt null) — concurrent viewers proxy. */
    concurrentViewers,
    generatedAt: new Date().toISOString(),
  };
}

function recordStreamGoLiveLatencyMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return;
  streamLatencyMs.observe(n);
}

function incrementActiveStreams() {
  activeStreams.inc(1);
}

function decrementActiveStreams() {
  activeStreams.dec(1);
}

function recordGiftTransaction(source = 'http') {
  giftTransactionsTotal.inc({ source: String(source || 'http').slice(0, 32) });
}

function recordRedisCacheHit(layer = 'unknown') {
  redisCacheHitsTotal.inc({ layer: String(layer || 'unknown').slice(0, 32) });
}

function recordRedisCacheMiss(layer = 'unknown') {
  redisCacheMissesTotal.inc({ layer: String(layer || 'unknown').slice(0, 32) });
}

/**
 * Record per-request feed pipeline stats (from @millo/discovery buildForYouFeed observe hook).
 * @param {{
 *   durationMs: number,
 *   candidateCount: number,
 *   afterFilterCount: number,
 *   beforeBusinessRulesCount: number,
 *   outputCount: number,
 *   finalScores: number[],
 *   distinctCreators: number,
 *   distinctCreatorsRatio?: number,
 *   creatorHhi: number,
 *   coldUser: boolean,
 *   pageOffset?: number,
 *   pageSize?: number
 * }} snap
 */
function observeFeedPipeline(snap) {
  if (!snap || typeof snap !== 'object') return;
  const ms = Number(snap.durationMs);
  if (Number.isFinite(ms) && ms >= 0) {
    feedBuildDurationSeconds.observe(ms / 1000);
  }
  const c0 = Number(snap.candidateCount);
  if (Number.isFinite(c0) && c0 >= 0) feedCandidatesBeforeFilter.observe(c0);
  const c1 = Number(snap.afterFilterCount);
  if (Number.isFinite(c1) && c1 >= 0) feedCandidatesAfterFilter.observe(c1);
  const c2 = Number(snap.beforeBusinessRulesCount);
  if (Number.isFinite(c2) && c2 >= 0) feedItemsBeforeBusinessRules.observe(c2);
  const out = Number(snap.outputCount);
  if (Number.isFinite(out) && out >= 0) feedOutputItems.observe(out);
  const scores = Array.isArray(snap.finalScores) ? snap.finalScores : [];
  for (const s of scores) {
    const v = Number(s);
    if (Number.isFinite(v)) feedItemFinalScore.observe(v);
  }
  const div = Number(snap.distinctCreatorsRatio);
  if (Number.isFinite(div) && div >= 0 && div <= 1) feedDistinctCreatorsRatio.observe(div);
  const hhi = Number(snap.creatorHhi);
  if (Number.isFinite(hhi) && hhi >= 0 && hhi <= 1) feedCreatorHhi.observe(hhi);
  const exp =
    snap.experimentBucket != null && String(snap.experimentBucket).length > 0
      ? String(snap.experimentBucket).slice(0, 48)
      : 'unknown';
  feedBuildsTotal.inc({
    cold_user: snap.coldUser === true ? 'true' : 'false',
    experiment_bucket: exp,
  });
}

function normalizeFeedKpiSource(source) {
  const s = source != null ? String(source) : '';
  const t = s.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
  return t || 'unknown';
}

/**
 * Record Part 10 KPI counters from a persisted FeedEvent (after create).
 * Safe to call on every event; never throws.
 * @param {{ eventType?: string, source?: string, watchTimeMs?: number }} doc
 */
function recordFeedKpiFromFeedEvent(doc) {
  if (!doc || typeof doc !== 'object') return;
  try {
    const source = normalizeFeedKpiSource(doc.source);
    const et = doc.eventType != null ? String(doc.eventType) : '';
    if (et === 'impression') {
      feedKpiImpressionsTotal.inc({ source });
      return;
    }
    if (et === 'play') {
      feedKpiPlaysTotal.inc({ source });
      return;
    }
    if (et === 'complete') {
      feedKpiCompletionsTotal.inc({ source });
      const sec = Math.max(0, Math.min(Number(doc.watchTimeMs) / 1000, 86400));
      if (Number.isFinite(sec)) {
        feedKpiWatchTimeSecondsTotal.inc({ source }, sec);
        feedKpiCompletionDurationSeconds.observe({ source }, sec);
      }
      return;
    }
    if (et === 'watch_2s' || et === 'watch_6s' || et === 'watch_15s') {
      feedKpiWatchMilestonesTotal.inc({ source, milestone: et });
      const sec = Math.max(0, Math.min(Number(doc.watchTimeMs) / 1000, 86400));
      if (Number.isFinite(sec)) {
        feedKpiReportedWatchDepthSeconds.observe({ source, milestone: et }, sec);
      }
    }
  } catch {
    /* never break feed path */
  }
}

module.exports = {
  metricsRoutes,
  getQueueDashboard,
  getQueueSize,
  getActiveStreams,
  getPaymentStats,
  getObservabilityStackSnapshot,
  getAdminMetricsSummary,
  getAdminMetricsObservability,
  getAdminMetricsSystem,
  getAdminMetricsQueues,
  getAdminMetricsPayments,
  getAdminMetricsLive,
  httpRequestsTotal,
  httpRequestDuration,
  paymentErrorsTotal,
  queueDepth,
  workerFailures,
  streamLatencyMs,
  activeStreams,
  giftTransactionsTotal,
  redisCacheHitsTotal,
  redisCacheMissesTotal,
  recordStreamGoLiveLatencyMs,
  incrementActiveStreams,
  decrementActiveStreams,
  recordGiftTransaction,
  recordRedisCacheHit,
  recordRedisCacheMiss,
  observeFeedPipeline,
  recordFeedKpiFromFeedEvent,
  feedBuildDurationSeconds,
  feedCandidatesBeforeFilter,
  feedCandidatesAfterFilter,
  feedOutputItems,
  feedKpiImpressionsTotal,
  feedKpiPlaysTotal,
  feedKpiCompletionsTotal,
  feedKpiWatchTimeSecondsTotal,
  feedKpiWatchMilestonesTotal,
  feedKpiCompletionDurationSeconds,
  feedKpiReportedWatchDepthSeconds,
};
