/**
 * API base + fetch helper — always targets the real API host (never relative /api/* on the SPA).
 * https://milloapp.com
 */
import { getApiBase } from '../config/api.js';
import { getToken } from '../sdk/authApi.js';

export const API_BASE = getApiBase();

/**
 * @param {string} path - Absolute path on API host, e.g. `/creators` or `/feed/for-you?limit=20`
 * @param {RequestInit} [options]
 * @returns {Promise<unknown>}
 */
export async function apiFetch(path, options = {}) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${p}`;
  const token = getToken();
  const headers = {
    ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    return res.json();
  }
  return res.text();
}
