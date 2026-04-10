'use strict';
/**
 * Infra capability flags — env-derived truth for clients and operators.
 * GET /api/system/capabilities, GET /system/capabilities (public, no auth).
 * https://milloapp.com
 */

const { getCapabilities } = require('../config/capabilities');

/**
 * @returns {Promise<object>} Flat legacy fields plus nested `capabilities` registry.
 */
async function getSystemCapabilities() {
  const capabilities = getCapabilities();
  const { infra } = capabilities;
  return {
    /** Kafka producers/consumers active (KAFKA_ENABLED=true), not merely broker env vars. */
    kafka: infra.kafkaEventBusEnabled,
    kafkaBrokersConfigured: infra.kafkaBrokersConfigured,
    redis: infra.redis,
    relationalSqlConfigured: infra.relationalSqlConfigured,
    primaryDatabase: infra.primaryDatabase,
    /** @deprecated Prefer `capabilities.payments`; legacy boolean = Stripe secret present. */
    payments: capabilities.payments.stripe,
    paymentsAnyRail: capabilities.payments.anyConfigured,
    capabilities,
    trust: capabilities.trust,
  };
}

module.exports = { getSystemCapabilities };
