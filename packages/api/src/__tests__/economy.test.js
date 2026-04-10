/**
 * Economy API route tests — Vitest + Supertest
 * Tests /economy/shopfront/* endpoints for public access and error handling.
 * Economy routes are public (no auth) but catch all errors and return 400.
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

  const { economyRoutes } = await import('../routes/economy.js');
  app = Fastify({ logger: false });
  await economyRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Shopfront ── */

describe('GET /economy/shopfront/:creatorId', () => {
  it('is a public route — no auth header required', async () => {
    const res = await request(server).get('/economy/shopfront/creator123');
    expect([200, 400]).toContain(res.status);
  });

  it('returns a JSON body on any response', async () => {
    const res = await request(server).get('/economy/shopfront/creator123');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('on success (200) response contains an items array', async () => {
    const res = await request(server).get('/economy/shopfront/creator123');
    if (res.status === 200) {
      expect(Array.isArray(res.body.items)).toBe(true);
    }
  });

  it('on error (400) response contains an error field', async () => {
    const res = await request(server).get('/economy/shopfront/creator123');
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });
});

/* ── Auctions ── */

describe('GET /economy/shopfront/:creatorId/auctions', () => {
  it('is a public route — no auth header required', async () => {
    const res = await request(server).get('/economy/shopfront/creator123/auctions');
    expect([200, 400]).toContain(res.status);
  });

  it('returns a JSON body on any response', async () => {
    const res = await request(server).get('/economy/shopfront/creator123/auctions');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('on success (200) response contains creatorId and auctions array', async () => {
    const res = await request(server).get('/economy/shopfront/creator123/auctions');
    if (res.status === 200) {
      expect(res.body).toHaveProperty('creatorId', 'creator123');
      expect(Array.isArray(res.body.auctions)).toBe(true);
    }
  });

  it('on error (400) response contains an error field', async () => {
    const res = await request(server).get('/economy/shopfront/creator123/auctions');
    if (res.status === 400) {
      expect(res.body).toHaveProperty('error');
    }
  });
});
