/**
 * Activity APIs — global feed + profile activity.
 * https://milloapp.com
 */
import { apiGet } from './httpClient';

export async function fetchActivityFeed(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  const data = await apiGet(`/activity/feed${qs ? `?${qs}` : ''}`);
  const items = data.feed ?? data.items ?? [];
  return { items, meta: { limit: data.limit, offset: data.offset, ok: data.ok } };
}

export async function fetchProfileActivity(userId, params = {}) {
  if (!userId) throw new Error('fetchProfileActivity requires userId');
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  const data = await apiGet(`/profile/${encodeURIComponent(userId)}/activity${qs ? `?${qs}` : ''}`);
  const items = data.activity ?? data.items ?? [];
  return { items, meta: { limit: data.limit, offset: data.offset } };
}
