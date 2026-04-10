/**
 * Kill-switch enforcement registry — all kill-switches must be checked here.
 * https://milloapp.com
 */
const REGISTRY = [
  { id: 'ADS_ENABLED', envKey: 'ADS_ENABLED', enforcedIn: '@millo/ads delivery.js' },
  { id: 'MILLA_ENABLED', envKey: 'MILLA_ENABLED', enforcedIn: '@millo/milla liveIntegration.js' },
  { id: 'LIVE_FILTERS_ENABLED', envKey: 'LIVE_FILTERS_ENABLED', enforcedIn: 'API /live/filters/status, SDKs' },
  { id: 'AI_OPTIMIZATION_ENABLED', envKey: 'AI_OPTIMIZATION_ENABLED', enforcedIn: '@millo/ai-optimization' },
];

function getKillSwitchRegistry() {
  return REGISTRY.map((k) => ({
    ...k,
    currentValue: process.env[k.envKey],
  }));
}

function isKillSwitchEnforced(id) {
  return REGISTRY.some((k) => k.id === id);
}

module.exports = { getKillSwitchRegistry, isKillSwitchEnforced, REGISTRY };
