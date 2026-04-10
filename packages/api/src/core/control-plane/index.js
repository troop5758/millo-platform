'use strict';
/**
 * CONTROL PLANE (mandatory core) — capability modes, snapshot, enforcement.
 * TypeScript types: see `./index.d.ts`.
 *
 * Prefer `getControlPlaneModes()` over reading env at module load (modes derive from
 * production-truth + infra signals). For HTTP guards use `requireCapability(feature)` or
 * `requireCapabilityLive(id)` (same LIVE-only rule; response fields differ slightly).
 *
 * Public snapshot: GET /api/system/control-plane
 * https://milloapp.com
 */

const {
  getControlPlaneSnapshot,
  isCapabilityLive,
  LIVE_EQUIVALENTS,
  mapTruthToMode,
  getControlPlaneModes,
  normalizePublicMode,
} = require('./capabilityRegistry');
const { SystemDisabledError } = require('./errors');
const { assertCapabilityLive, requireCapabilityLive, requireCapability } = require('./enforcement');

/** @type {readonly string[]} */
const MODE_ENUM = Object.freeze([
  'LIVE',
  'PARTIAL',
  'STUBBED',
  'DISABLED',
  'SHADOW',
]);

/**
 * Lazy flat mode map — same values as `getControlPlaneModes()` on each property read.
 * Do not cache across requests if you need real-time env updates; call `getControlPlaneModes()` instead.
 */
const ControlPlane = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      const modes = getControlPlaneModes();
      return modes[String(prop)];
    },
    ownKeys() {
      return Reflect.ownKeys(getControlPlaneModes());
    },
    getOwnPropertyDescriptor(_t, prop) {
      const modes = getControlPlaneModes();
      if (Object.prototype.hasOwnProperty.call(modes, prop)) {
        return { configurable: true, enumerable: true, value: modes[String(prop)] };
      }
    },
  }
);

/** Documentation mirror for IDE / consumers (modes vary by capability). */
const Capability = Object.freeze({
  payments: 'LIVE | PARTIAL | DISABLED',
  payouts: 'LIVE | PARTIAL | DISABLED',
  email: 'LIVE | PARTIAL | DISABLED',
  push: 'LIVE | PARTIAL | DISABLED',
  kyc: 'LIVE | STUBBED | DISABLED',
  aiModeration: 'LIVE | SHADOW | DISABLED',
  liveStreaming: 'LIVE | PARTIAL | DISABLED',
  liveFilters: 'LIVE | STUBBED',
  oauth: 'LIVE | PARTIAL | DISABLED',
  fraudProtection: 'LIVE | PARTIAL | DISABLED',
});

module.exports = {
  MODE_ENUM,
  Capability,
  ControlPlane,
  getControlPlaneModes,
  normalizePublicMode,
  getControlPlaneSnapshot,
  isCapabilityLive,
  LIVE_EQUIVALENTS,
  mapTruthToMode,
  SystemDisabledError,
  assertCapabilityLive,
  requireCapabilityLive,
  requireCapability,
};
