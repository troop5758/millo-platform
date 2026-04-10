'use strict';
/**
 * Observability stack — enterprise contract (Prometheus, Grafana, Sentry + admin metrics JSON).
 *
 * - **Prometheus** scrapes `GET /metrics` on the API (see `routes/metrics.js` + `infra/monitoring/prometheus.yml`).
 * - **Grafana** consumes Prometheus; local stack in `infra/monitoring/docker-compose.yml`.
 * - **Sentry** when `SENTRY_DSN` is set (`packages/api/src/index.js`).
 *
 * **Metrics API** (Bearer: admin or ops — `dashboardsRoutes`):
 *   GET /admin/metrics/system | payments | live | queues
 *   plus GET /admin/metrics (summary) and GET /admin/metrics/observability (merged).
 *   Aliases: /dashboards/admin/metrics/…
 *
 * Live snapshot (env-aware): `require('../../routes/metrics').getObservabilityStackSnapshot()`.
 * https://milloapp.com
 */

/** Product-required observability systems (all should be wired in production). */
const REQUIRED_SYSTEMS = Object.freeze(['prometheus', 'grafana', 'sentry']);

/** Admin JSON metrics endpoints (relative to API origin, e.g. https://milloapp.com). */
const ADMIN_METRICS_ROUTES = Object.freeze({
  summary: '/admin/metrics',
  system: '/admin/metrics/system',
  payments: '/admin/metrics/payments',
  live: '/admin/metrics/live',
  queues: '/admin/metrics/queues',
  observability: '/admin/metrics/observability',
});

/** Same handlers as ADMIN_METRICS_ROUTES, under dashboards prefix. */
const DASHBOARDS_ADMIN_METRICS_ROUTES = Object.freeze({
  summary: '/dashboards/admin/metrics',
  system: '/dashboards/admin/metrics/system',
  payments: '/dashboards/admin/metrics/payments',
  live: '/dashboards/admin/metrics/live',
  queues: '/dashboards/admin/metrics/queues',
  observability: '/dashboards/admin/metrics/observability',
});

/**
 * Static contract for docs, tests, and service mesh config (no I/O).
 * @returns {{
 *   requiredSystems: string[],
 *   metricsApi: typeof ADMIN_METRICS_ROUTES,
 *   dashboardsAliases: typeof DASHBOARDS_ADMIN_METRICS_ROUTES,
 *   prometheusScrapePath: string,
 *   rbac: string,
 * }}
 */
function getObservabilityStackContract() {
  return {
    requiredSystems: [...REQUIRED_SYSTEMS],
    metricsApi: { ...ADMIN_METRICS_ROUTES },
    dashboardsAliases: { ...DASHBOARDS_ADMIN_METRICS_ROUTES },
    prometheusScrapePath: '/metrics',
    rbac: 'admin or ops (dashboards.hasRole)',
  };
}

/**
 * @returns {ReturnType<import('../../routes/metrics').getObservabilityStackSnapshot>}
 */
function getObservabilityStackSnapshot() {
  return require('../../routes/metrics').getObservabilityStackSnapshot();
}

module.exports = {
  REQUIRED_SYSTEMS,
  ADMIN_METRICS_ROUTES,
  DASHBOARDS_ADMIN_METRICS_ROUTES,
  getObservabilityStackContract,
  getObservabilityStackSnapshot,
};
