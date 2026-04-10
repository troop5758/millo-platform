/**
 * Live Capability Layer — contract: only `LIVE` enables full product UI; otherwise show coming-soon / limited UX.
 * Aligns with GET /api/system/control-plane `live` and GET /api/live/status `live`.
 * https://milloapp.com
 */

/**
 * @param {'LIVE'|'STUBBED'|'OFF'|string|undefined|null} mode
 * @returns {boolean} true if UI should show coming-soon (not fully live)
 */
export function showComingSoon(mode) {
  return mode !== 'LIVE';
}

/**
 * @param {'LIVE'|'STUBBED'|'OFF'|string|undefined|null} mode
 * @returns {boolean} true if the capability is fully live
 */
export function isLiveFeatureLive(mode) {
  return mode === 'LIVE';
}
