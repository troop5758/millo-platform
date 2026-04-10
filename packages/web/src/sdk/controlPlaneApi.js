/**
 * Production control plane — public snapshot for UI truth / FeatureGate.
 * https://milloapp.com
 */
import { API_BASE } from '../config/api.js';

/**
 * @returns {Promise<{ version: number, ts: string, capabilities: Record<string, { mode: string }> }>}
 */
export async function fetchControlPlaneSnapshot() {
  const res = await fetch(`${API_BASE}/api/system/control-plane`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`control_plane_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
