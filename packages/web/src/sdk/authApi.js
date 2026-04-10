/**
 * Auth SDK — register, login, logout, password reset, current user.
 * Persists token + user in localStorage. Exports useAuth() React hook.
 * Phase 11: Records device fingerprint after auth for fraud detection.
 * https://milloapp.com
 */
import { useState, useEffect, useCallback } from 'react';
import { getDeviceFingerprintPayload, clearDeviceFingerprintSessionCache } from '../lib/deviceFingerprint';
import { maybeRestartBehaviorCollector, stopBehaviorCollector } from '../lib/behaviorCollector';
import {
  sendBehavior,
  stopBehaviorTracking,
  maybeRestartBehaviorTracking,
  getBehaviorData,
} from '../lib/behavior';
import { API_BASE } from '../config/api.js';

const BASE = API_BASE;
const TOKEN_KEY = 'millo_token';
const USER_KEY  = 'millo_user';

function getToken()  { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function getUser()   { try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem('millo_session_exp', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
  } catch { /* ignore */ }
}
function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('millo_session_exp');
  } catch { /* ignore */ }
}

function authHeaders() {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
  return data;
}
async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
  return data;
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
  return data;
}

function userSkippedDeviceFingerprinting() {
  try {
    const u = getUser();
    return !!(u && u.optOutFingerprinting);
  } catch {
    return false;
  }
}

/** Fire-and-forget: record device to POST /security/device (Bearer). Payload: FingerprintJS visitorId or SHA-256(collectDeviceFingerprint()). */
function recordDeviceFingerprint() {
  if (userSkippedDeviceFingerprinting()) return;
  getDeviceFingerprintPayload()
    .then((payload) => {
      const id = payload?.visitorId || payload?.fingerprint;
      if (!id || String(id).trim().length < 8) return;
      return fetch(`${BASE}/security/device`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
    })
    .catch(() => {});
}

export async function register({ email, password, displayName, username }) {
  const data = await post('/auth/register', { email, password, displayName, username });
  if (data.token && data.user) {
    saveAuth(data.token, data.user);
    await sendBehavior().catch(() => {});
    recordDeviceFingerprint();
    maybeRestartBehaviorCollector();
    maybeRestartBehaviorTracking();
  }
  return data;
}

/** POST /compliance/consent — call after register when user accepts terms/privacy (P1#9). */
export async function submitComplianceConsent(body) {
  return post('/compliance/consent', body);
}

/**
 * Password login with RBA payloads (device fingerprint, behavioral snapshot optional).
 * Returns `{ token, user }` on success, or `{ requireCaptcha, siteKey }` / `{ stepUp, otpId }` without throwing.
 */
export async function login(opts = {}) {
  const { email, password, captchaToken, deviceType = 'web' } = opts;
  if (!email || !password) throw new Error('EMAIL_AND_PASSWORD_REQUIRED');

  let deviceId = opts.deviceId;
  if (!deviceId) {
    try {
      const payload = await getDeviceFingerprintPayload();
      deviceId = payload?.visitorId || payload?.fingerprint;
    } catch {
      deviceId = undefined;
    }
  }

  const body = {
    email,
    password,
    deviceType,
    ...(deviceId && { deviceId: String(deviceId).slice(0, 256) }),
    ...(captchaToken && { captchaToken }),
    behavior: getBehaviorData(),
  };

  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (data.requireCaptcha || data.stepUp) {
    return data;
  }

  if (res.ok && data.token && data.user) {
    saveAuth(data.token, data.user);
    await sendBehavior().catch(() => {});
    recordDeviceFingerprint();
    maybeRestartBehaviorCollector();
    maybeRestartBehaviorTracking();
    return data;
  }

  throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
}

/** Complete step-up after `login` returned `{ stepUp: true, otpId }`. */
export async function verifyLoginOtp(opts = {}) {
  const { otpId, code, deviceType = 'web' } = opts;
  if (!otpId || code == null) throw new Error('OTP_ID_AND_CODE_REQUIRED');

  let deviceId = opts.deviceId;
  if (!deviceId) {
    try {
      const payload = await getDeviceFingerprintPayload();
      deviceId = payload?.visitorId || payload?.fingerprint;
    } catch {
      deviceId = undefined;
    }
  }

  const res = await fetch(`${BASE}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otpId,
      code: String(code).trim(),
      deviceType,
      ...(deviceId && { deviceId: String(deviceId).slice(0, 256) }),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
  }
  if (data.token && data.user) {
    saveAuth(data.token, data.user);
    await sendBehavior().catch(() => {});
    recordDeviceFingerprint();
    maybeRestartBehaviorCollector();
    maybeRestartBehaviorTracking();
  }
  return data;
}

export async function logout() {
  await post('/auth/logout', {}).catch(() => {});
  stopBehaviorCollector();
  stopBehaviorTracking();
  clearAuth();
}

export async function fetchMe() {
  const data = await get('/auth/me');
  if (data.user) {
    saveAuth(getToken(), data.user);
    recordDeviceFingerprint();
    maybeRestartBehaviorCollector();
    maybeRestartBehaviorTracking();
  }
  return data.user;
}

/** Update account privacy preferences (e.g. optOutFingerprinting). */
export async function patchAuthPreferences(body) {
  const data = await patch('/auth/me/preferences', body);
  if (data.user) {
    saveAuth(getToken(), data.user);
    clearDeviceFingerprintSessionCache();
    maybeRestartBehaviorCollector();
    maybeRestartBehaviorTracking();
  }
  return data;
}

export async function requestPasswordReset(email) {
  return post('/auth/password-reset/request', { email });
}

export async function confirmPasswordReset({ token, userId, newPassword }) {
  return post('/auth/password-reset/confirm', { token, userId, newPassword });
}

/** List active sessions for the current user. */
export async function getSessions() {
  const data = await get('/auth/sessions');
  return data.sessions || [];
}

/** Revoke a session by id. */
export async function invalidateSession(sessionId) {
  return post(`/auth/sessions/${encodeURIComponent(sessionId)}/invalidate`, {});
}

/** Extend the current session TTL. Returns { token, user } on success. */
export async function refreshSession() {
  const data = await post('/auth/refresh', {});
  if (data.token && data.user) {
    saveAuth(data.token, data.user);
    recordDeviceFingerprint();
  }
  return data;
}

export { getToken, getUser, clearAuth };

/* ── React hook ── */
export function useAuth() {
  const [user,    setUser]    = useState(() => getUser());
  const [loading, setLoading] = useState(false);

  // On mount: fetch current user and silently refresh the session token if it's
  // within the REFRESH_THRESHOLD_MS window of expiry (7 days).
  // Session TTL is 30 days; a background refresh keeps the user logged in.
  const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetchMe()
      .then(async (u) => {
        setUser(u);
        // Check stored session for imminent expiry and silently refresh
        try {
          const stored = localStorage.getItem('millo_session_exp');
          const exp    = stored ? Number(stored) : null;
          const needsRefresh = !exp || (exp - Date.now()) < REFRESH_THRESHOLD_MS;
          if (needsRefresh) {
            const refreshed = await refreshSession().catch(() => null);
            if (refreshed?.user) {
              setUser(refreshed.user);
              // Store new expiry estimate (30 days from now)
              localStorage.setItem('millo_session_exp', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
            }
          }
        } catch { /* silent */ }
      })
      .catch(() => clearAuth())
      .finally(() => setLoading(false));
  }, []);

  const doLogin = useCallback(async (email, password) => {
    const data = await login({ email, password });
    if (data.user) setUser(data.user);
    return data;
  }, []);

  const doRegister = useCallback(async (fields) => {
    const data = await register(fields);
    setUser(data.user);
    return data;
  }, []);

  const doLogout = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  return { user, loading, login: doLogin, register: doRegister, logout: doLogout };
}
