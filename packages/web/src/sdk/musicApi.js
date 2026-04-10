/**
 * Music Library API — royalty-free tracks for streams/videos.
 * https://milloapp.com
 */
import { API_BASE } from '../config/api';
import { getToken } from './authApi';

function headers() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getMusicTracks(params = {}) {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  if (params.genre) sp.set('genre', params.genre);
  if (params.license) sp.set('license', params.license);
  const res = await fetch(`${API_BASE}/music?${sp}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function searchMusic(q, params = {}) {
  const sp = new URLSearchParams({ q });
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const res = await fetch(`${API_BASE}/music/search?${sp}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function getMusicTrending(params = {}) {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.genre) sp.set('genre', params.genre);
  if (params.region) sp.set('region', params.region);
  if (params.cluster) sp.set('cluster', params.cluster);
  const res = await fetch(`${API_BASE}/music/trending?${sp}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Regions for geographic trending (trending_sounds_us, etc.). */
export async function getMusicRegions() {
  const res = await fetch(`${API_BASE}/music/regions`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { regions: [] };
  return data;
}

/** Sponsored sounds (brand-paid promotion). */
export async function getMusicSponsored(params = {}) {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  const res = await fetch(`${API_BASE}/music/sponsored?${sp}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Sound challenges (brand-paid, e.g. Nike challenge sound). */
export async function getMusicChallenges(params = {}) {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  const res = await fetch(`${API_BASE}/music/challenges?${sp}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function getMusicTrack(id) {
  const res = await fetch(`${API_BASE}/music/${encodeURIComponent(id)}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function getMusicLicenses() {
  const res = await fetch(`${API_BASE}/music/licenses`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function createMusicTrack(body) {
  const res = await fetch(`${API_BASE}/music`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}
