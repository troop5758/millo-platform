/**
 * Observability stack contract. Runtime: `./stack.js`.
 * https://milloapp.com
 */

export type ObservabilitySystem = 'prometheus' | 'grafana' | 'sentry';

export const REQUIRED_SYSTEMS: readonly ObservabilitySystem[];

export const ADMIN_METRICS_ROUTES: {
  readonly summary: string;
  readonly system: string;
  readonly payments: string;
  readonly live: string;
  readonly queues: string;
  readonly observability: string;
};

export const DASHBOARDS_ADMIN_METRICS_ROUTES: typeof ADMIN_METRICS_ROUTES;

export function getObservabilityStackContract(): {
  requiredSystems: string[];
  metricsApi: Record<string, string>;
  dashboardsAliases: Record<string, string>;
  prometheusScrapePath: string;
  rbac: string;
};

export function getObservabilityStackSnapshot(): Record<string, unknown>;
