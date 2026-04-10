/**
 * Public trust snapshot from GET /health (no auth).
 * https://milloapp.com
 */
import { API_BASE } from '../config/api.js';

/**
 * @returns {Promise<Record<string, { status: string, detail?: unknown }>|null>}
 */
export async function fetchPublicTrustSnapshot() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health ${res.status}`);
  const data = await res.json();
  return data.checks?.production_truth ?? null;
}

/**
 * Trust Enforcement Layer — LIVE | SHADOW | OFF per trust capability (public).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchTrustEnforcementSnapshot() {
  const res = await fetch(`${API_BASE}/api/system/trust-enforcement`);
  if (!res.ok) throw new Error(`Trust enforcement ${res.status}`);
  return res.json();
}
