/**
 * Shared fetch helpers for web SDK modules.
 * https://milloapp.com
 */
import { getToken } from './authApi';
import { API_BASE } from '../config/api.js';

export { API_BASE };

export function authHeaders() {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  let data = {};
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `API ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  let data = {};
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `API ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
