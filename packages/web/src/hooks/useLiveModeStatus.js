/**
 * Client hook for GET /api/live/status + build-time filter kill-switch.
 * https://milloapp.com
 */
import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';
import { features } from '../config/features';
import { loadLiveModeStatus } from '../lib/liveStatus';
import { showComingSoon } from '../lib/liveCapability';

/**
 * @returns {{
 *   webrtc: 'LIVE'|'STUBBED',
 *   filters: 'LIVE'|'STUBBED',
 *   live?: { streaming: string, filters: 'LIVE'|'STUBBED' }
 * }|null} null while loading
 */
export function useLiveModeStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadLiveModeStatus(API_BASE).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/**
 * Show live filter controls only when API reports filters LIVE and profile/Vite does not disable.
 * Contract: if (showComingSoon(filters)) show coming-soon UI — see `lib/liveCapability.js`.
 * While loading: false (treat as not live — show coming soon).
 */
export function useLiveFiltersControlsVisible() {
  const status = useLiveModeStatus();
  if (!status) return false;
  const filterMode = status.live?.filters ?? status.filters;
  return !showComingSoon(filterMode) && features.liveFilters;
}
