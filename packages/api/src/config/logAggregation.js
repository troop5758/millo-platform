'use strict';
/**
 * Log aggregation configuration.
 * When LOG_AGGREGATION_ENABLED=true, logs are written to app.log for external collectors
 * (Filebeat, Fluentd, Datadog agent, etc.) to ship to centralized logging.
 *
 * Loki (Grafana): set LOG_LOKI_ENABLED=true and LOG_LOKI_HOST (e.g. http://127.0.0.1:3100).
 * Elastic: set LOG_ELASTIC_ENABLED=true and LOG_ELASTIC_NODE (e.g. http://127.0.0.1:9200).
 *
 * Env vars:
 *   LOG_AGGREGATION_ENABLED - set to 'true' to enable (logs always go to app.log)
 *   LOG_LOKI_ENABLED       - set to 'true' to ship logs to Grafana Loki
 *   LOG_LOKI_HOST / LOKI_HOST - Loki push URL (e.g. http://127.0.0.1:3100)
 *   LOG_ELASTIC_ENABLED    - set to 'true' to ship logs to Elastic
 *   LOG_ELASTIC_NODE / ELASTICSEARCH_NODE - Elastic node URL (e.g. http://127.0.0.1:9200)
 *   LOG_ELASTIC_INDEX_PREFIX - Elastic index prefix (default: millo-api)
 *   LOG_ELASTIC_USERNAME / LOG_ELASTIC_PASSWORD - optional basic auth
 *   LOG_LEVEL - info | debug | warn | error (default: info)
 *   LOGS_DIR - override logs directory (default: packages/api/logs)
 *
 * External collectors typically tail packages/api/logs/app.log.
 * https://milloapp.com
 */
module.exports = {
  enabled: process.env.LOG_AGGREGATION_ENABLED === 'true',
  lokiEnabled: process.env.LOG_LOKI_ENABLED === 'true',
  lokiHost: process.env.LOG_LOKI_HOST || process.env.LOKI_HOST || null,
  elasticEnabled: process.env.LOG_ELASTIC_ENABLED === 'true',
  elasticNode: process.env.LOG_ELASTIC_NODE || process.env.ELASTICSEARCH_NODE || null,
  elasticIndexPrefix: process.env.LOG_ELASTIC_INDEX_PREFIX || 'millo-api',
  level: process.env.LOG_LEVEL || 'info',
  logsDir: process.env.LOGS_DIR || null,
};
