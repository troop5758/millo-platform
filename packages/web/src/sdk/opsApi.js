/**
 * Ops / queue surfaces (admin-only API).
 * https://milloapp.com
 */
import { apiGet } from './httpClient';

export async function fetchOpsHealth() {
  return apiGet('/ops/health');
}

export async function fetchWorkerHealth() {
  return apiGet('/ops/workers');
}

export async function fetchQueueStats() {
  return apiGet('/ops/queues');
}
