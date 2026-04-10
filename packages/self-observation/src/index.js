/**
 * Self-observation engine — drift, upgrade advisor, health, security.
 * Recommendations visible; no auto-changes. https://milloapp.com
 */
const driftDetection = require('./driftDetection');
const upgradeAdvisor = require('./upgradeAdvisor');
const healthDashboards = require('./healthDashboards');
const securityAlerts = require('./securityAlerts');

async function getRecommendations(options = {}) {
  const [drift, upgrade, health, security] = await Promise.all([
    Promise.resolve(driftDetection.detectDrift(options)),
    Promise.resolve(upgradeAdvisor.getUpgradeRecommendations(options)),
    healthDashboards.getHealthStatus(options).catch(() => ({ status: 'unknown', checks: {}, autoChange: false })),
    Promise.resolve(securityAlerts.getSecurityAlerts(options)),
  ]);

  const recommendations = [
    ...(drift.recommendations || []),
    ...(upgrade.recommendations || []),
    ...(security.alerts || []),
  ].map((r) => ({ ...r, autoChange: false }));

  return {
    recommendations,
    health: health.status || health,
    drift: drift.recommendations,
    upgrade: upgrade.recommendations,
    security: security.alerts,
    autoChange: false,
  };
}

const WORKER_QUEUE_NAMES = ['trust-decay', 'payout-retry', 'payment-deadline', 'fraud-check'];

async function getQueueStats() {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT) || 6379;
  try {
    const { Queue } = require('bullmq');
    const connection = { host, port };
    const queues = [];
    for (const name of WORKER_QUEUE_NAMES) {
      const q = new Queue(name, { connection });
      const counts = await q.getJobCounts().catch(() => ({}));
      queues.push({ name, ...counts });
      await q.close();
    }
    return { queues };
  } catch (e) {
    return { queues: [], message: e.message || 'Redis/BullMQ unavailable' };
  }
}

async function getWorkerMetrics() {
  const { queues } = await getQueueStats();
  let jobs_processed = 0;
  let failures = 0;
  for (const q of queues) {
    jobs_processed += Number(q.completed ?? 0);
    failures += Number(q.failed ?? 0);
  }
  return { jobs_processed, failures, queues };
}

module.exports = {
  ...driftDetection,
  ...upgradeAdvisor,
  ...healthDashboards,
  ...securityAlerts,
  getRecommendations,
  getQueueStats,
  getWorkerMetrics,
};
