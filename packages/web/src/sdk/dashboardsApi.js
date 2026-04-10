/**
 * Dashboards API client — Admin / Mod / Support. Sends X-User-Id and X-User-Role; when logged in, also sends Bearer token for production.
 * https://milloapp.com
 */
import { API_BASE } from '../config/api';

function getToken() {
  try {
    return localStorage.getItem('millo_token') || '';
  } catch {
    return '';
  }
}

function headers(staffUser) {
  const h = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (staffUser?.userId) h['X-User-Id'] = String(staffUser.userId);
  if (staffUser?.role) h['X-User-Role'] = String(staffUser.role);
  return h;
}

async function request(method, path, body, staffUser) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(staffUser),
    ...(body != null && { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

// Admin
export async function adminFinancialOps(staffUser, action, payload) {
  return request('POST', '/dashboards/admin/financial-ops', { action, payload }, staffUser);
}
export async function adminKillSwitch(staffUser, which, enabled) {
  return request('POST', '/dashboards/admin/kill-switch', { which, enabled }, staffUser);
}

/** RBAC: admin | support | ops — persisted toggles + process.env. */
export async function adminGetFeatureToggles(staffUser) {
  return request('GET', '/admin/feature-toggles', null, staffUser);
}

export async function adminFeatureToggle(staffUser, feature, enabled) {
  return request('POST', '/admin/feature-toggle', { feature, enabled }, staffUser);
}
export async function adminLedger(staffUser, userId, limit = 50) {
  const q = limit ? `?limit=${limit}` : '';
  return request('GET', `/dashboards/admin/ledger/${encodeURIComponent(userId)}${q}`, null, staffUser);
}
export async function adminGetFraudAlerts(staffUser, opts = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.eventType) params.set('eventType', opts.eventType);
  const q = params.toString() ? `?${params}` : '';
  return request('GET', `/dashboards/admin/fraud-alerts${q}`, null, staffUser);
}
export async function adminEconomy(staffUser, action, payload) {
  return request('POST', '/dashboards/admin/economy', { action, payload }, staffUser);
}

// Moderator
export async function modLiveModeration(staffUser, streamId, action, meta = {}) {
  return request('POST', '/dashboards/mod/live-moderation', { streamId, action, meta }, staffUser);
}
export async function modAbuseQueue(staffUser, status, limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  return request('GET', `/dashboards/mod/abuse-queue?${params}`, null, staffUser);
}
export async function modAppeals(staffUser, status, limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  return request('GET', `/dashboards/mod/appeals?${params}`, null, staffUser);
}
export async function modResolveAppeal(staffUser, appealId, decision, reason) {
  return request('POST', `/dashboards/mod/appeals/${encodeURIComponent(appealId)}/resolve`, { decision, reason }, staffUser);
}

// Branding
export async function adminGetBranding(staffUser) {
  return request('GET', '/dashboards/admin/branding', null, staffUser);
}
export async function adminSaveBranding(staffUser, patch) {
  return request('POST', '/dashboards/admin/branding', patch, staffUser);
}
export async function adminEmailPreview(staffUser, params) {
  const { API_BASE } = await import('../config/api');
  const h = {};
  if (staffUser?.userId) h['X-User-Id']   = String(staffUser.userId);
  if (staffUser?.role)   h['X-User-Role'] = String(staffUser.role);
  h['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}/dashboards/admin/branding/email-preview`, {
    method: 'POST', headers: h, body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Preview failed');
  return res.text();
}

// Notification settings
export async function adminGetNotifSettings(staffUser) {
  return request('GET', '/dashboards/admin/notifications/settings', null, staffUser);
}
export async function adminSaveNotifSettings(staffUser, patch) {
  return request('POST', '/dashboards/admin/notifications/settings', patch, staffUser);
}
export async function adminTestEmail(staffUser, to, subject) {
  return request('POST', '/dashboards/admin/notifications/test-email', { to, subject }, staffUser);
}

// Analytics (real KPIs)
export async function adminGetAnalytics(staffUser) {
  return request('GET', '/dashboards/admin/analytics', null, staffUser);
}

// Users
export async function adminSearchUsers(staffUser, q = '', page = 1, limit = 25, role = '') {
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  if (role) params.set('role', role);
  return request('GET', `/dashboards/admin/users?${params}`, null, staffUser);
}
/** List support agents only (admin). */
export async function adminListSupportAgents(staffUser, page = 1, limit = 50) {
  return request('GET', `/dashboards/admin/users?role=support&page=${page}&limit=${limit}`, null, staffUser);
}
/** Create support account (admin only). */
export async function adminCreateSupportAccount(staffUser, { email, password, displayName, canModerate = true, canViewTickets = true, canRespondTickets = true }) {
  return request('POST', '/admin/create-support', {
    email,
    password,
    displayName,
    canModerate: !!canModerate,
    canViewTickets: !!canViewTickets,
    canRespondTickets: !!canRespondTickets,
  }, staffUser);
}
/** Patch user (admin): role, creatorStatus, flags, permissions. */
export async function adminPatchUser(staffUser, userId, patch) {
  return request('PATCH', `/dashboards/admin/users/${encodeURIComponent(userId)}`, patch, staffUser);
}
export async function adminGetUser(staffUser, userId) {
  return request('GET', `/dashboards/admin/users/${encodeURIComponent(userId)}`, null, staffUser);
}
export async function adminUserAction(staffUser, userId, action, payload = {}) {
  return request('POST', `/dashboards/admin/users/${encodeURIComponent(userId)}/action`, { action, payload }, staffUser);
}
export async function adminSuspendUser(staffUser, userId, reason = '') {
  return request('POST', `/dashboards/admin/users/${encodeURIComponent(userId)}/suspend`, { reason }, staffUser);
}
export async function adminUnsuspendUser(staffUser, userId, reason = '') {
  return request('POST', `/dashboards/admin/users/${encodeURIComponent(userId)}/unsuspend`, { reason }, staffUser);
}
/** Admin audit logs (compliance). */
export async function adminGetAuditLogs(staffUser, opts = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.action) params.set('action', opts.action);
  const q = params.toString() ? `?${params}` : '';
  return request('GET', `/dashboards/admin/audit-logs${q}`, null, staffUser);
}

// Moderation reports (Bearer-token auth — uses standard JWT, not staff headers)
function bearerHeaders() {
  try { const t = localStorage.getItem('millo_token') || ''; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; } catch { return { 'Content-Type': 'application/json' }; }
}
async function bearerRequest(method, path, body = null) {
  const res = await fetch(`${API_BASE}${path}`, { method, headers: bearerHeaders(), ...(body != null && { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}
export async function adminGetReports(status = 'open', limit = 50) {
  return bearerRequest('GET', `/moderation/reports?status=${encodeURIComponent(status)}&limit=${limit}`);
}
export async function adminReportAction(reportId, action) {
  return bearerRequest('POST', `/moderation/reports/${encodeURIComponent(reportId)}/action`, { action });
}

// Payouts (admin)
export async function adminGetPayouts(status = 'pending', page = 1, limit = 50) {
  return bearerRequest('GET', `/payments/payouts/admin?status=${encodeURIComponent(status)}&page=${page}&limit=${limit}`);
}
export async function adminPaymentsSearch(staffUser, params = {}) {
  const q = new URLSearchParams();
  if (params.userId) q.set('userId', params.userId);
  if (params.creatorId) q.set('creatorId', params.creatorId);
  if (params.amountMin != null) q.set('amountMin', params.amountMin);
  if (params.amountMax != null) q.set('amountMax', params.amountMax);
  if (params.start) q.set('start', params.start);
  if (params.end) q.set('end', params.end);
  if (params.action) q.set('action', params.action);
  if (params.limit) q.set('limit', params.limit);
  if (params.offset) q.set('offset', params.offset);
  return request('GET', `/dashboards/admin/payments/search?${q}`, null, staffUser);
}
export async function adminPayoutAction(payoutId, action, note = '') {
  return bearerRequest('POST', `/payments/payouts/${encodeURIComponent(payoutId)}/action`, { action, note });
}

// Observability (admin) — health, security, drift, upgrade
export async function adminGetObservationHealth(staffUser) {
  return bearerRequest('GET', '/observation/health');
}

/** Root /health — DB, economy, notifications checks + uptime (public, no auth) */
export async function adminGetRootHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
export async function adminGetObservationSecurity(staffUser) {
  return bearerRequest('GET', '/observation/security');
}
export async function adminGetObservationDrift(staffUser) {
  return bearerRequest('GET', '/observation/drift');
}
export async function adminGetObservationUpgrade(staffUser) {
  return bearerRequest('GET', '/observation/upgrade');
}
export async function adminGetObservationRecommendations(staffUser) {
  return bearerRequest('GET', '/observation/recommendations');
}
export async function adminGetObservationQueues(staffUser) {
  return bearerRequest('GET', '/observation/queues');
}
export async function adminGetWorkerMetrics() {
  return bearerRequest('GET', '/workers/metrics');
}

/** Admin ops dashboard — summary KPIs (Bearer; admin only). */
export async function adminGetMetricsOverview() {
  return bearerRequest('GET', '/admin/metrics/overview');
}
/** Per-pipeline queue waiting counts (video / bot-detection / email). */
export async function adminGetMetricsQueuesOps() {
  return bearerRequest('GET', '/admin/metrics/queues/ops');
}
/** Live streaming gauges + Mongo live count. */
export async function adminGetMetricsLive() {
  return bearerRequest('GET', '/admin/metrics/live');
}
/** Payment Prometheus counters (errors, gift txns) — admin JSON. */
export async function adminGetMetricsPayments() {
  return bearerRequest('GET', '/admin/metrics/payments');
}

/** Financial anomaly alerts (admin) */
export async function adminGetAnomalies(staffUser, lookbackDays = 7) {
  const q = lookbackDays ? `?lookbackDays=${lookbackDays}` : '';
  return request('GET', `/dashboards/admin/anomalies${q}`, null, staffUser);
}

/** Moderation dashboard (admin): Content Authenticity + Trend Monitoring panels */
export async function adminGetModerationDashboard(staffUser, params = {}) {
  const q = new URLSearchParams(params).toString();
  return request('GET', `/dashboards/admin/moderation/dashboard${q ? `?${q}` : ''}`, null, staffUser);
}
/** Content Authenticity Panel: authenticity score, suspicious signals, device clusters */
export async function adminGetContentAuthenticityPanel(staffUser, params = {}) {
  const q = new URLSearchParams(params).toString();
  return request('GET', `/dashboards/admin/moderation/content-authenticity${q ? `?${q}` : ''}`, null, staffUser);
}
/** Trend Monitoring Panel: trending hashtags, suspicious spikes, creator clusters */
export async function adminGetTrendMonitoringPanel(staffUser, params = {}) {
  const q = new URLSearchParams(params).toString();
  return request('GET', `/dashboards/admin/moderation/trend-monitoring${q ? `?${q}` : ''}`, null, staffUser);
}

// Support
export async function supportTicketsList(staffUser, status, limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  return request('GET', `/dashboards/support/tickets?${params}`, null, staffUser);
}
export async function supportTicketCreate(staffUser, userId, subject) {
  return request('POST', '/dashboards/support/tickets', { userId, subject }, staffUser);
}
export async function supportRefund(staffUser, userId, amountCents, reason) {
  return request('POST', '/dashboards/support/refund', { userId, amountCents, reason }, staffUser);
}
export async function supportUserTools(staffUser, action, payload) {
  return request('POST', '/dashboards/support/user-tools', { action, payload }, staffUser);
}

/** PATCH /support/:id — admin/support: update ticket status, adminNotes, trackingStatus */
export async function supportTicketUpdate(staffUser, ticketId, body) {
  return request('PATCH', `/support/${encodeURIComponent(ticketId)}`, body, staffUser);
}
