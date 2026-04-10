/**
 * Disputes list API.
 * https://milloapp.com
 */
import { apiGet } from './httpClient';

/**
 * @param {object} params query (limit, status)
 * @param {{ admin?: boolean }} [options] — `admin: true` uses GET /admin/disputes (staff view)
 */
export async function fetchDisputes(params = {}, options = {}) {
  const { admin = false } = options;
  const base = admin ? '/admin/disputes' : '/disputes';
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.status) q.set('status', String(params.status));
  const qs = q.toString();
  const raw = await apiGet(`${base}${qs ? `?${qs}` : ''}`);
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return { items, meta: {} };
}
