'use strict';
/**
 * Live subsystem UI contract — streaming mode from control plane; filters from live capability layer (via getControlPlaneModes).
 *
 * UI contract (filters): if mode is not LIVE, defer live-filters product UI (e.g. Coming Soon).
 *   if (!isLiveFiltersLive(LiveStatus.filters)) return <ComingSoon />;
 *
 * API mirror: GET /api/live/status exposes `live` from liveCapabilityLayer; `LiveStatus.streaming` matches ControlPlane.liveStreaming.
 * https://milloapp.com
 */

const { ControlPlane, getControlPlaneModes } = require('../control-plane');

/**
 * Plain snapshot for JSON / SSR / clients.
 * @returns {{ streaming: string, filters: 'LIVE'|'STUBBED' }}
 */
function getLiveStatus() {
  const modes = getControlPlaneModes();
  const filters = modes.liveFilters === 'LIVE' ? 'LIVE' : 'STUBBED';
  return {
    streaming: modes.liveStreaming,
    filters,
  };
}

/**
 * Lazy reads — `streaming` tracks `ControlPlane.liveStreaming`; `filters` uses live ingest pipeline gate.
 */
const LiveStatus = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'streaming') {
        return ControlPlane.liveStreaming;
      }
      if (prop === 'filters') {
        const modes = getControlPlaneModes();
        return modes.liveFilters === 'LIVE' ? 'LIVE' : 'STUBBED';
      }
      return undefined;
    },
    ownKeys() {
      return ['streaming', 'filters'];
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (prop === 'streaming' || prop === 'filters') {
        const snap = getLiveStatus();
        return {
          enumerable: true,
          configurable: true,
          value: snap[String(prop)],
        };
      }
    },
  }
);

/**
 * @param {string} [filters] — e.g. LiveStatus.filters or getLiveStatus().filters
 * @returns {boolean}
 */
function isLiveFiltersLive(filters) {
  return String(filters ?? '').toUpperCase() === 'LIVE';
}

module.exports = {
  LiveStatus,
  getLiveStatus,
  isLiveFiltersLive,
};
