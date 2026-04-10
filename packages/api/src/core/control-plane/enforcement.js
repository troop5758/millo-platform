'use strict';
/**
 * Mandatory enforcement helpers — use on routes or in services that must not run when a capability is not LIVE.
 * https://milloapp.com
 */

const { getControlPlaneSnapshot, isCapabilityLive, getControlPlaneModes } = require('./capabilityRegistry');
const { SystemDisabledError } = require('./errors');

/**
 * @param {string} capabilityId
 * @throws {SystemDisabledError}
 */
function assertCapabilityLive(capabilityId) {
  const snap = getControlPlaneSnapshot();
  const row = snap.capabilities[capabilityId];
  const mode = row?.mode;
  if (!mode || !isCapabilityLive(capabilityId, mode)) {
    throw new SystemDisabledError(
      `${capabilityId} is not LIVE (mode=${mode || 'unknown'})`,
      { capability: capabilityId, mode }
    );
  }
}

/**
 * Fastify preHandler factory — 503 + JSON body when capability is not LIVE.
 * @param {string} capabilityId
 * @returns {(req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
function requireCapabilityLive(capabilityId) {
  return async function controlPlaneGuard(request, reply) {
    const snap = getControlPlaneSnapshot();
    const row = snap.capabilities[capabilityId];
    const mode = row?.mode;
    if (!mode || !isCapabilityLive(capabilityId, mode)) {
      request.log.warn({ capabilityId, mode }, 'control_plane_guard_blocked');
      return reply.status(503).send({
        error: 'SYSTEM_CAPABILITY_DISABLED',
        code: 'SYSTEM_CAPABILITY_DISABLED',
        capability: capabilityId,
        mode: mode || 'unknown',
        message: `${capabilityId} is not available in LIVE mode`,
      });
    }
  };
}

/**
 * Strict LIVE gate (product contract): any mode other than LIVE → 503.
 * Response shape matches control-plane JSON contract: `error` + `mode`.
 * @param {string} feature — keyof return of getControlPlaneModes()
 * @returns {(req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
function requireCapability(feature) {
  const key = String(feature || '');
  return async function capabilityGuard(request, reply) {
    const modes = getControlPlaneModes();
    const mode = modes[key];
    if (mode !== 'LIVE') {
      request.log.warn({ feature: key, mode }, 'control_plane_require_capability_blocked');
      return reply.status(503).send({
        error: `${key} unavailable`,
        code: 'SYSTEM_CAPABILITY_DISABLED',
        capability: key,
        mode: mode || 'unknown',
        message: `${key} is not available in LIVE mode`,
      });
    }
  };
}

module.exports = {
  assertCapabilityLive,
  requireCapabilityLive,
  requireCapability,
};
