/**
 * dashboardsApi.js unit tests — Vitest
 * Mocks globalThis.fetch so no real network calls are made.
 * Covers: admin financial ops, kill switch, ledger, economy,
 *         moderator (live mod, abuse queue, appeals),
 *         branding, notification settings, analytics, users,
 *         reports, payouts, support tools.
 * https://milloapp.com
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ── import.meta shim ── */
vi.stubEnv('VITE_API_URL', 'http://localhost:3001');

/* ── Shim import.meta.env for the module's BEARER_BASE ── */
globalThis.import = { meta: { env: { VITE_API_URL: 'http://localhost:3001' } } };

/* ── localStorage mock (needed by dashboardsApi bearerHeaders) ── */
const store = {};
const localStorageMock = {
  getItem:    (k)    => store[k] ?? null,
  setItem:    (k, v) => { store[k] = String(v); },
  removeItem: (k)    => { delete store[k]; },
  clear:      ()     => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

const {
  adminFinancialOps,
  adminKillSwitch,
  adminFeatureToggle,
  adminLedger,
  adminEconomy,
  modLiveModeration,
  modAbuseQueue,
  modAppeals,
  modResolveAppeal,
  adminGetBranding,
  adminSaveBranding,
  adminGetNotifSettings,
  adminSaveNotifSettings,
  adminTestEmail,
  adminGetAnalytics,
  adminSearchUsers,
  adminUserAction,
  adminGetReports,
  adminReportAction,
  adminGetPayouts,
  adminPayoutAction,
  supportTicketsList,
  supportTicketCreate,
  supportRefund,
  supportUserTools,
} = await import('../dashboardsApi.js');

/* ── Shared staff user ── */
const STAFF = { userId: 'admin1', role: 'admin' };
const MOD   = { userId: 'mod1',   role: 'mod' };

/* ── fetch mock helpers ── */
function mockFetch(status, body) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json:   () => Promise.resolve(body),
  });
}
function mockFetchErr(status, errorMsg = 'Forbidden') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok:     false,
    status,
    statusText: errorMsg,
    json:   () => Promise.resolve({ error: errorMsg }),
  });
}

beforeEach(() => { localStorageMock.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

/* ── Helper: verify staff headers are sent ── */
function expectStaffHeaders(staffUser) {
  const opts = globalThis.fetch.mock.calls[0][1];
  expect(opts.headers['X-User-Id']).toBe(String(staffUser.userId));
  expect(opts.headers['X-User-Role']).toBe(staffUser.role);
}

/* ─────────────────────────────────────────── */
describe('adminFinancialOps()', () => {
  it('posts action and payload with staff headers', async () => {
    mockFetch(200, { ok: true });
    await adminFinancialOps(STAFF, 'freeze', { userId: 'u1' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('freeze');
    expect(body.payload.userId).toBe('u1');
    expectStaffHeaders(STAFF);
  });

  it('throws on 403', async () => {
    mockFetchErr(403, 'Forbidden');
    await expect(adminFinancialOps(STAFF, 'freeze', {})).rejects.toThrow();
  });
});

describe('adminKillSwitch()', () => {
  it('posts kill-switch with correct body', async () => {
    mockFetch(200, { ok: true });
    await adminKillSwitch(STAFF, 'payments', true);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.which).toBe('payments');
    expect(body.enabled).toBe(true);
  });
});

describe('adminFeatureToggle()', () => {
  it('posts /admin/feature-toggle with feature + enabled', async () => {
    mockFetch(200, { ok: true, toggles: {} });
    await adminFeatureToggle(STAFF, 'ads', false);
    const call = globalThis.fetch.mock.calls[0];
    expect(call[0]).toContain('/admin/feature-toggle');
    const body = JSON.parse(call[1].body);
    expect(body.feature).toBe('ads');
    expect(body.enabled).toBe(false);
  });
});

describe('adminLedger()', () => {
  it('builds correct URL with userId and limit', async () => {
    mockFetch(200, { ledger: [] });
    await adminLedger(STAFF, 'user123', 25);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/admin/ledger/user123');
    expect(url).toContain('limit=25');
  });
});

describe('adminEconomy()', () => {
  it('posts economy action', async () => {
    mockFetch(200, { ok: true });
    await adminEconomy(STAFF, 'adjust', { delta: 100 });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('adjust');
  });
});

describe('modLiveModeration()', () => {
  it('posts live mod action with streamId and reason', async () => {
    mockFetch(200, { ok: true });
    await modLiveModeration(MOD, 'stream-1', 'warn', { reason: 'Spam' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.streamId).toBe('stream-1');
    expect(body.action).toBe('warn');
    expect(body.meta.reason).toBe('Spam');
    expectStaffHeaders(MOD);
  });
});

describe('modAbuseQueue()', () => {
  it('builds URL with status and limit', async () => {
    mockFetch(200, []);
    await modAbuseQueue(MOD, 'pending', 10);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('status=pending');
    expect(url).toContain('limit=10');
  });

  it('omits status param when not provided', async () => {
    mockFetch(200, []);
    await modAbuseQueue(MOD, undefined, 50);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).not.toContain('status=');
  });
});

describe('modAppeals()', () => {
  it('builds URL with status', async () => {
    mockFetch(200, []);
    await modAppeals(MOD, 'pending', 20);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('status=pending');
  });
});

describe('modResolveAppeal()', () => {
  it('posts resolve with decision and reason', async () => {
    mockFetch(200, { ok: true });
    await modResolveAppeal(MOD, 'appeal-1', 'upheld', 'Policy violation confirmed');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.decision).toBe('upheld');
    expect(body.reason).toBe('Policy violation confirmed');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/appeals/appeal-1/resolve');
  });
});

describe('adminGetBranding() / adminSaveBranding()', () => {
  it('GETs branding config', async () => {
    mockFetch(200, { primaryColor: '#ff0000' });
    const result = await adminGetBranding(STAFF);
    expect(result.primaryColor).toBe('#ff0000');
  });

  it('POSTs branding patch', async () => {
    mockFetch(200, { ok: true });
    await adminSaveBranding(STAFF, { primaryColor: '#00ff00' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.primaryColor).toBe('#00ff00');
  });
});

describe('adminGetNotifSettings() / adminSaveNotifSettings()', () => {
  it('GETs notification settings', async () => {
    mockFetch(200, { emailEnabled: true, pushEnabled: false });
    const result = await adminGetNotifSettings(STAFF);
    expect(result.emailEnabled).toBe(true);
  });

  it('POSTs notification settings update', async () => {
    mockFetch(200, { ok: true });
    await adminSaveNotifSettings(STAFF, { emailEnabled: false });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.emailEnabled).toBe(false);
  });
});

describe('adminTestEmail()', () => {
  it('posts test email with to and subject', async () => {
    mockFetch(200, { ok: true });
    await adminTestEmail(STAFF, 'test@example.com', 'Test Subject');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.to).toBe('test@example.com');
    expect(body.subject).toBe('Test Subject');
  });
});

describe('adminGetAnalytics()', () => {
  it('returns analytics KPIs', async () => {
    mockFetch(200, { dau: 1200, mau: 34000, revenue: 50000 });
    const result = await adminGetAnalytics(STAFF);
    expect(result.dau).toBe(1200);
    expectStaffHeaders(STAFF);
  });
});

describe('adminSearchUsers()', () => {
  it('builds URL with query, page and limit', async () => {
    mockFetch(200, { users: [], total: 0 });
    await adminSearchUsers(STAFF, 'alice', 2, 10);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('q=alice');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });
});

describe('adminUserAction()', () => {
  it('posts action with payload', async () => {
    mockFetch(200, { ok: true });
    await adminUserAction(STAFF, 'user-1', 'suspend', { reason: 'ToS violation' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('suspend');
    expect(body.payload.reason).toBe('ToS violation');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/users/user-1/action');
  });
});

describe('adminGetReports() / adminReportAction()', () => {
  it('builds reports URL with status and limit', async () => {
    mockFetch(200, { reports: [] });
    await adminGetReports('open', 20);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('status=open');
    expect(url).toContain('limit=20');
  });

  it('posts report action', async () => {
    mockFetch(200, { ok: true });
    await adminReportAction('report-1', 'dismiss');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('dismiss');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/reports/report-1/action');
  });
});

describe('adminGetPayouts() / adminPayoutAction()', () => {
  it('builds payouts URL with status, page, limit', async () => {
    mockFetch(200, { payouts: [], total: 0 });
    await adminGetPayouts('pending', 1, 25);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('status=pending');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=25');
  });

  it('posts payout action with note', async () => {
    mockFetch(200, { ok: true });
    await adminPayoutAction('payout-1', 'approve', 'Looks good');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('approve');
    expect(body.note).toBe('Looks good');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/payouts/payout-1/action');
  });
});

describe('supportTicketsList()', () => {
  it('builds URL with status and limit', async () => {
    mockFetch(200, { tickets: [] });
    await supportTicketsList(STAFF, 'open', 30);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('status=open');
    expect(url).toContain('limit=30');
  });
});

describe('supportTicketCreate()', () => {
  it('posts userId and subject', async () => {
    mockFetch(200, { ticket: { id: 't1' } });
    await supportTicketCreate(STAFF, 'user-5', 'Billing issue');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.userId).toBe('user-5');
    expect(body.subject).toBe('Billing issue');
  });
});

describe('supportRefund()', () => {
  it('posts refund with userId, amountCents, reason', async () => {
    mockFetch(200, { ok: true });
    await supportRefund(STAFF, 'user-5', 2000, 'Double charge');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.amountCents).toBe(2000);
    expect(body.reason).toBe('Double charge');
  });
});

describe('supportUserTools()', () => {
  it('posts action and payload', async () => {
    mockFetch(200, { ok: true });
    await supportUserTools(STAFF, 'reset_password', { userId: 'u99' });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('reset_password');
    expect(body.payload.userId).toBe('u99');
  });
});
