/**
 * Pricing API route tests — Vitest + Supertest
 * Tests the /pricing/* endpoints for public access and admin auth guards.
 * Public endpoints must return 200; admin endpoints must return 403 without auth.
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

  const { pricingRoutes } = await import('../routes/pricing.js');
  app = Fastify({ logger: false });
  await pricingRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Public routes (no auth required) ── */

describe('GET /pricing/geo', () => {
  it('returns 200 without auth', async () => {
    const res = await request(server)
      .get('/pricing/geo');
    expect(res.status).toBe(200);
  });

  it('returns ok:true with country and region info', async () => {
    const res = await request(server)
      .get('/pricing/geo');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.country).toBeTruthy();
    expect(res.body.tier).toBeTruthy();
  });
});

describe('GET /pricing/config', () => {
  it('returns 200 without auth', async () => {
    const res = await request(server)
      .get('/pricing/config');
    expect(res.status).toBe(200);
  });

  it('returns 200 with ?country query param', async () => {
    const res = await request(server)
      .get('/pricing/config?country=BR');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns config object with public pricing fields', async () => {
    const res = await request(server)
      .get('/pricing/config');
    expect(res.status).toBe(200);
    expect(res.body.config).toBeTruthy();
  });
});

/* ── Admin routes (require admin role — return 403 without valid admin token) ── */

describe('GET /pricing/admin/config', () => {
  it('returns 403 without auth', async () => {
    const res = await request(server)
      .get('/pricing/admin/config');
    expect(res.status).toBe(403);
  });

  it('returns 403 with non-admin token', async () => {
    const res = await request(server)
      .get('/pricing/admin/config')
      .set('Authorization', 'Bearer regular-user-token');
    expect(res.status).toBe(403);
  });
});

describe('POST /pricing/admin/config', () => {
  it('returns 403 without auth', async () => {
    const res = await request(server)
      .post('/pricing/admin/config')
      .send({ coinsPerDollar: 100 });
    expect(res.status).toBe(403);
  });
});

describe('POST /pricing/admin/config/reset', () => {
  it('returns 403 without auth', async () => {
    const res = await request(server)
      .post('/pricing/admin/config/reset')
      .send({ field: 'coinsPerDollar' });
    expect(res.status).toBe(403);
  });
});

describe('GET /pricing/admin/regions', () => {
  it('returns 403 without auth', async () => {
    const res = await request(server)
      .get('/pricing/admin/regions');
    expect(res.status).toBe(403);
  });
});

describe('POST /pricing/admin/regions', () => {
  it('returns 403 without auth', async () => {
    const res = await request(server)
      .post('/pricing/admin/regions')
      .send({ tiers: {} });
    expect(res.status).toBe(403);
  });

  it('returns 403 with invalid token', async () => {
    const res = await request(server)
      .post('/pricing/admin/regions')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ tiers: {} });
    expect(res.status).toBe(403);
  });
});
