/**
 * Ads / Campaigns API route tests — Vitest + Supertest
 * Tests the /ads/* endpoints for auth guards and public access.
 * Creator routes require a valid session; admin routes require admin role.
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

  const { adsRoutes } = await import('../routes/ads.js');
  app = Fastify({ logger: false });
  await adsRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Create campaign (requires auth) ── */

describe('POST /ads/campaigns', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/ads/campaigns')
      .send({ name: 'My Campaign', objective: 'awareness' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/ads/campaigns')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ name: 'My Campaign' });
    expect(res.status).toBe(401);
  });
});

/* ── List my campaigns (requires auth) ── */

describe('GET /ads/campaigns', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .get('/ads/campaigns');
    expect(res.status).toBe(401);
  });
});

/* ── Get single campaign (requires auth) ── */

describe('GET /ads/campaigns/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .get('/ads/campaigns/campaign123');
    expect(res.status).toBe(401);
  });
});

/* ── Public: get ad feed (no auth required) ── */

describe('GET /ads/feed', () => {
  it('does not return 401 or 403 without auth', async () => {
    const res = await request(server)
      .get('/ads/feed');
    expect([401, 403]).not.toContain(res.status);
  });

  it('does not return 401 or 403 with placement query param', async () => {
    const res = await request(server)
      .get('/ads/feed?placement=feed&limit=3');
    expect([401, 403]).not.toContain(res.status);
  });
});

/* ── Admin: approve campaign (requires admin role) ── */

describe('POST /ads/campaigns/:id/approve', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .post('/ads/campaigns/campaign123/approve');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 401 or 403 with non-admin token', async () => {
    const res = await request(server)
      .post('/ads/campaigns/campaign123/approve')
      .set('Authorization', 'Bearer regular-user-token');
    expect([401, 403]).toContain(res.status);
  });
});

/* ── Admin: pause campaign (requires admin role) ── */

describe('POST /ads/campaigns/:id/pause', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .post('/ads/campaigns/campaign123/pause');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 401 or 403 with non-admin token', async () => {
    const res = await request(server)
      .post('/ads/campaigns/campaign123/pause')
      .set('Authorization', 'Bearer regular-user-token');
    expect([401, 403]).toContain(res.status);
  });
});

/* ── Admin: list all campaigns (requires admin role) ── */

describe('GET /ads/admin/all', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .get('/ads/admin/all');
    expect([401, 403]).toContain(res.status);
  });
});
