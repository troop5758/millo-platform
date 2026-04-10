/**
 * Build-time feature flags from repo config/production-profile.json, overridable via Vite env.
 * https://milloapp.com
 */
import productionProfile from '@millo-config/production-profile.json';

const env = (k) => (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[k] : undefined);

function boolEnv(v) {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}

const liveFiltersOverride = boolEnv(env('VITE_FEATURE_LIVE_FILTERS'));
const liveCohostOverride = boolEnv(env('VITE_FEATURE_LIVE_COHOST'));
const millaOverride = boolEnv(env('VITE_FEATURE_MILLA'));

/** TikTok-level live defaults (overridable via production-profile.json). */
const LIVE_SYSTEM_DEFAULTS = Object.freeze({
  liveStreaming: true,
  liveGoLive: true,
  liveViewerCount: true,
  liveChat: true,
  liveGifts: true,
  liveModerators: true,
  liveCohost: true,
});

/** @type {Record<string, boolean>} */
const base = productionProfile?.features && typeof productionProfile.features === 'object'
  ? { ...productionProfile.features }
  : {};

export const features = {
  ...LIVE_SYSTEM_DEFAULTS,
  ...base,
  liveFilters: liveFiltersOverride != null ? liveFiltersOverride : Boolean(base.liveFilters),
  liveCohost:
    liveCohostOverride != null
      ? liveCohostOverride
      : base.liveCohost === undefined
        ? LIVE_SYSTEM_DEFAULTS.liveCohost
        : Boolean(base.liveCohost),
  milla: millaOverride != null ? millaOverride : Boolean(base.milla),
};
