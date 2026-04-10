/**
 * Dashboards API route tests — Vitest + Supertest
 * Tests the /dashboards/* endpoints for auth guards.
 * All dashboard routes require authentication; admin routes require admin role.
 *
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

let app;
let server;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { dashboardsRoutes } = await import('../routes/dashboards.js');
  app = Fastify({ logger: false });
  await dashboardsRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Admin financial ops ── */

describe('POST /dashboards/admin/financial-ops', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/admin/financial-ops')
      .send({ action: 'freeze', payload: {} });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/dashboards/admin/financial-ops')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ action: 'freeze', payload: {} });
    expect(res.status).toBe(401);
  });
});

/* ── Admin kill-switch ── */

describe('POST /dashboards/admin/kill-switch', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/admin/kill-switch')
      .send({ which: 'payments', enabled: false });
    expect(res.status).toBe(401);
  });
});

/* ── Admin financial view ── */

describe('GET /dashboards/admin/financial-view/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .get('/dashboards/admin/financial-view/user123');
    expect(res.status).toBe(401);
  });
});

/* ── Admin ledger view ── */

describe('GET /dashboards/admin/ledger/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .get('/dashboards/admin/ledger/user123');
    expect(res.status).toBe(401);
  });
});

/* ── Admin economy control ── */

describe('POST /dashboards/admin/economy', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/admin/economy')
      .send({ action: 'adjust_rates', payload: {} });
    expect(res.status).toBe(401);
  });
});

/* ── Mod live moderation ── */

describe('POST /dashboards/mod/live-moderation', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/mod/live-moderation')
      .send({ streamId: 'stream123', action: 'warn' });
    expect(res.status).toBe(401);
  });
});

/* ── Mod abuse review ── */

describe('POST /dashboards/mod/abuse-review', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/mod/abuse-review')
      .send({ reportId: 'report123', action: 'dismiss' });
    expect(res.status).toBe(401);
  });
});

/* ── Admin analytics (role-gated: requires admin role) ── */

describe('GET /dashboards/admin/analytics', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .get('/dashboards/admin/analytics');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 401 or 403 with invalid token', async () => {
    const res = await request(server)
      .get('/dashboards/admin/analytics')
      .set('Authorization', 'Bearer regular-user-token');
    expect([401, 403]).toContain(res.status);
  });
});

/* ── Admin branding (role-gated: requires admin role) ── */

describe('GET /dashboards/admin/branding', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .get('/dashboards/admin/branding');
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /dashboards/admin/branding', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .post('/dashboards/admin/branding')
      .send({ appName: 'Millo' });
    expect([401, 403]).toContain(res.status);
  });
});
