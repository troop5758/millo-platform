'use strict';
/**
 * Unified admin ops snapshot for WebSocket `metrics:update` (and optional HTTP reuse).
 * https://milloapp.com
 */
const db = require('@millo/database');
const dashboards = require('@millo/dashboards');
const { getOverviewPayload, getQueuesOpsPayload } = require('../routes/admin.metrics');
const {
  getAdminMetricsLive,
  getAdminMetricsPayments,
} = require('../routes/metrics');

/** RBAC-only stub — getFraudAlerts only checks role === 'admin'. */
const STUB_ADMIN = Object.freeze({ _id: '000000000000000000000001', role: 'admin' });

function sumCounterValues(counter) {
  if (!counter?.values?.length) return 0;
  return counter.values.reduce((s, v) => s + (Number(v.value) || 0), 0);
}

function collectFlaggedUserIds(alerts) {
  const ids = new Set();
  if (!Array.isArray(alerts)) return ids;
  for (const a of alerts) {
    if (a.userId) ids.add(String(a.userId));
    if (a.alertType === 'device_farm' && Array.isArray(a.meta?.userIds)) {
      for (const u of a.meta.userIds) {
        if (u) ids.add(String(u));
      }
    }
  }
  return ids;
}

function countBlocked(alerts) {
  if (!Array.isArray(alerts)) return 0;
  return alerts.filter((a) => a.action === 'block').length;
}

function normalizeLive(d) {
  const activeStreams =
    d.mongoLiveStreams != null
      ? d.mongoLiveStreams
      : (() => {
          const av = d?.gauges?.activeStreams?.values;
          return Array.isArray(av) && av[0] != null ? av[0].value : null;
        })();
  return {
    activeStreams,
    concurrentViewers: d.concurrentViewers != null ? d.concurrentViewers : null,
    generatedAt: d.generatedAt,
  };
}

async function buildAdminOpsMetricsPushPayload() {
  const [overview, queues, liveRaw, pay, payoutsPending, fraudAlerts] = await Promise.all([
    getOverviewPayload(),
    getQueuesOpsPayload(),
    getAdminMetricsLive(),
    getAdminMetricsPayments(),
    db.PayoutRequest.countDocuments({ status: 'pending' }).catch(() => 0),
    dashboards.getFraudAlerts(STUB_ADMIN, { limit: 200 }).catch(() => []),
  ]);

  const gift = pay?.counters?.giftTransactions;
  const errors = pay?.counters?.paymentErrors;
  const list = Array.isArray(fraudAlerts) ? fraudAlerts : [];

  return {
    overview,
    queues,
    live: normalizeLive(liveRaw),
    payments: {
      totalVolume: sumCounterValues(gift),
      failedPayments: sumCounterValues(errors),
      payoutsPending,
    },
    fraud: {
      flaggedUsers: collectFlaggedUserIds(list).size,
      blockedTransactions: countBlocked(list),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildAdminOpsMetricsPushPayload };
