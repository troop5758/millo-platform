/**
 * Admin AI controls — GET merges env + PlatformSettings; POST persists overrides (PUT also supported on API).
 * https://milloapp.com
 */
import { apiGet, apiPost } from './httpClient';

export async function fetchAIControls() {
  return apiGet('/admin/ai-controls');
}

export async function updateAIControls(payload) {
  return apiPost('/admin/ai-controls', payload);
}
