/**
 * authApi.js unit tests — Vitest
 * Tests the pure logic helpers (token storage, header building) by mocking
 * localStorage and globalThis.fetch so no real network calls are made.
 * https://milloapp.com
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ── localStorage mock ── */
const store = {};
const localStorageMock = {
  getItem:    (k)    => store[k] ?? null,
  setItem:    (k, v) => { store[k] = String(v); },
  removeItem: (k)    => { delete store[k]; },
  clear:      ()     => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

/* ── import after mocks are set up ── */
const {
  getToken,
  getUser,
  clearAuth,
  login,
  logout,
  refreshSession,
  register,
} = await import('../authApi.js');

/* ── fetch mock helper ── */
function mockFetch(status, body) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => { localStorageMock.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('getToken / getUser / clearAuth', () => {
  it('returns empty string when no token is stored', () => {
    expect(getToken()).toBe('');
  });

  it('returns null when no user is stored', () => {
    expect(getUser()).toBeNull();
  });

  it('clearAuth removes token, user and session_exp', () => {
    store['millo_token']       = 'tok123';
    store['millo_user']        = '{"id":"1"}';
    store['millo_session_exp'] = '9999999999999';
    clearAuth();
    expect(getToken()).toBe('');
    expect(getUser()).toBeNull();
    expect(store['millo_session_exp']).toBeUndefined();
  });
});

describe('login()', () => {
  it('saves token and user on successful login', async () => {
    mockFetch(200, { token: 'tok-abc', user: { id: 'u1', email: 'a@b.com', role: 'user' } });
    const result = await login({ email: 'a@b.com', password: 'password123' });
    expect(result.token).toBe('tok-abc');
    expect(getToken()).toBe('tok-abc');
    expect(getUser()?.email).toBe('a@b.com');
  });

  it('throws and does not save auth on failed login', async () => {
    mockFetch(401, { error: 'INVALID_CREDENTIALS' });
    await expect(login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow();
    expect(getToken()).toBe('');
  });

  it('returns step-up payload without persisting session', async () => {
    mockFetch(200, { ok: false, stepUp: true, otpId: 'otp-key-1' });
    const result = await login({ email: 'a@b.com', password: 'password123' });
    expect(result.stepUp).toBe(true);
    expect(result.otpId).toBe('otp-key-1');
    expect(getToken()).toBe('');
  });
});

describe('register()', () => {
  it('saves token and user on successful registration', async () => {
    mockFetch(200, { token: 'tok-reg', user: { id: 'u2', email: 'new@b.com', role: 'user' } });
    const result = await register({ email: 'new@b.com', password: 'password123' });
    expect(result.token).toBe('tok-reg');
    expect(getToken()).toBe('tok-reg');
  });
});

describe('logout()', () => {
  it('clears auth even if the API call fails', async () => {
    store['millo_token'] = 'old-tok';
    mockFetch(500, { error: 'SERVER_ERROR' });
    await logout();
    expect(getToken()).toBe('');
  });
});

describe('refreshSession()', () => {
  it('replaces token with the refreshed one', async () => {
    store['millo_token'] = 'old-tok';
    mockFetch(200, { ok: true, token: 'new-tok', user: { id: 'u1', email: 'a@b.com', role: 'user' } });
    const result = await refreshSession();
    expect(result.token).toBe('new-tok');
    expect(getToken()).toBe('new-tok');
  });

  it('throws on 401 (expired / invalid token)', async () => {
    store['millo_token'] = 'expired-tok';
    mockFetch(401, { error: 'UNAUTHORIZED' });
    await expect(refreshSession()).rejects.toThrow();
  });
});
