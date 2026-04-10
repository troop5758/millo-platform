/**
 * Legal / DMCA API — designated agent, takedown notice, counter-notice, admin notices.
 * https://milloapp.com
 */
import { API_BASE } from '../config/api';
import { getToken } from './authApi';

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function adminHeaders(staffUser) {
  const h = { 'Content-Type': 'application/json' };
  if (staffUser?.userId) h['X-User-Id'] = String(staffUser.userId);
  if (staffUser?.role) h['X-User-Role'] = String(staffUser.role);
  return h;
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

async function post(path, body, staffUser = null) {
  const headers = staffUser ? adminHeaders(staffUser) : authHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

/** Public: get designated DMCA agent (name, address, email). */
export async function getDmcaAgent() {
  const res = await fetch(`${API_BASE}/legal/dmca/agent`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Public: submit a DMCA takedown notice. No auth required. */
export async function submitTakedownNotice(body) {
  return post('/legal/dmca/takedown-notice', body);
}

/** Authenticated: submit counter-notice (content owner). Requires login. */
export async function submitCounterNotice(body) {
  return post('/legal/dmca/counter-notice', body);
}

/** Admin: list DMCA notices. */
export async function listDmcaNotices(staffUser, opts = {}) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const q = params.toString() ? `?${params}` : '';
  const res = await fetch(`${API_BASE}/legal/dmca/notices${q}`, {
    headers: adminHeaders(staffUser),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Admin: accept notice and take down content. */
export async function acceptDmcaNotice(staffUser, noticeId) {
  return post(`/legal/dmca/notices/${encodeURIComponent(noticeId)}/accept`, {}, staffUser);
}

/** Admin: reject notice. */
export async function rejectDmcaNotice(staffUser, noticeId, reason = '') {
  return post(`/legal/dmca/notices/${encodeURIComponent(noticeId)}/reject`, { reason }, staffUser);
}

/** Admin: restore content after counter-notice period. */
export async function restoreDmcaNotice(staffUser, noticeId) {
  return post(`/legal/dmca/notices/${encodeURIComponent(noticeId)}/restore`, {}, staffUser);
}

/** Admin: mark lawsuit filed (do not restore). */
export async function lawsuitFiledDmcaNotice(staffUser, noticeId) {
  return post(`/legal/dmca/notices/${encodeURIComponent(noticeId)}/lawsuit-filed`, {}, staffUser);
}
