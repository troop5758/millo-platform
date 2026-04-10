#!/usr/bin/env node
/**
 * Phase 5 validation: Kill-switch disables filters instantly; filters engine + performance guard exist.
 * Run from repo root. Tests same contract as API GET /live/filters/status.
 */
const path = require('path');
const livePath = path.join(__dirname, '..', 'packages', 'live', 'src', 'filtersEngine.js');
const { getFiltersEnabled, getAvailableFilters, applyFilterWithGuard } = require(livePath);

// Kill-switch ON (disabled): filters must be off instantly
process.env.LIVE_FILTERS_ENABLED = 'false';
const enabledWhenKillSwitchOn = getFiltersEnabled();
if (enabledWhenKillSwitchOn !== false) {
  console.error('[validate-phase5] FAIL: kill-switch should disable filters; got enabled =', enabledWhenKillSwitchOn);
  process.exit(1);
}
console.log('[validate-phase5] Kill-switch ON -> enabled=false: OK');

// Kill-switch OFF (normal): filters enabled
process.env.LIVE_FILTERS_ENABLED = 'true';
const enabledWhenKillSwitchOff = getFiltersEnabled();
if (enabledWhenKillSwitchOff !== true) {
  console.error('[validate-phase5] FAIL: without kill-switch filters should be enabled; got enabled =', enabledWhenKillSwitchOff);
  process.exit(1);
}
console.log('[validate-phase5] Kill-switch OFF -> enabled=true: OK');

// Default (env unset): filters enabled
delete process.env.LIVE_FILTERS_ENABLED;
const enabledDefault = getFiltersEnabled();
if (enabledDefault !== true) {
  console.error('[validate-phase5] FAIL: default should be enabled; got enabled =', enabledDefault);
  process.exit(1);
}
console.log('[validate-phase5] Default -> enabled=true: OK');

// Filters engine: list and guard
const filterIds = getAvailableFilters();
if (!Array.isArray(filterIds) || filterIds.length === 0) {
  console.error('[validate-phase5] FAIL: getAvailableFilters() must return non-empty array');
  process.exit(1);
}
console.log('[validate-phase5] Filters engine getAvailableFilters(): OK');

// Performance guard: timeout returns source unchanged
process.env.LIVE_FILTERS_ENABLED = 'true';
applyFilterWithGuard('source', 'none', { maxMs: 5 }).then((guarded) => {
  if (guarded !== 'source') {
    console.error('[validate-phase5] FAIL: applyFilterWithGuard should return source (stub)');
    process.exit(1);
  }
  console.log('[validate-phase5] Performance guard applyFilterWithGuard(): OK');
  console.log('[validate-phase5] Validation passed. Kill-switch disables filters instantly.');
}).catch((e) => {
  console.error('[validate-phase5] FAIL:', e.message);
  process.exit(1);
});
