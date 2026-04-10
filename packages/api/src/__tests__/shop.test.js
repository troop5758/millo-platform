/**
 * Shop API route tests — Vitest + Supertest
 * Tests the /shop/* endpoints for auth guards, input validation, and public access.
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

  const { shopRoutes } = await import('../routes/shop.js');
  app = Fastify({ logger: false });
  await shopRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Public product browsing ── */

describe('GET /shop/products', () => {
  it('returns 200 with products array', async () => {
    const res = await request(server).get('/shop/products');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('products');
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it('accepts creatorId filter', async () => {
    const res = await request(server).get('/shop/products?creatorId=abc');
    expect(res.status).toBe(200);
  });

  it('accepts pagination', async () => {
    const res = await request(server).get('/shop/products?limit=10&offset=0');
    expect(res.status).toBe(200);
  });
});

describe('GET /shop/products/:id', () => {
  it('returns 404 for nonexistent product', async () => {
    const res = await request(server).get('/shop/products/000000000000000000000001');
    expect(res.status).toBe(404);
  });
});

describe('GET /shop/creator/:creatorId/products', () => {
  it('returns 200 with products array for creator', async () => {
    const res = await request(server).get('/shop/creator/000000000000000000000001/products');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('products');
  });
});

describe('GET /shop/creator/:creatorId/auctions', () => {
  it('returns 200 with auctions array', async () => {
    const res = await request(server).get('/shop/creator/000000000000000000000001/auctions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('auctions');
    expect(Array.isArray(res.body.auctions)).toBe(true);
  });
});

describe('GET /shop/auctions/:id', () => {
  it('returns 404 for nonexistent auction', async () => {
    const res = await request(server).get('/shop/auctions/000000000000000000000001');
    expect(res.status).toBe(404);
  });
});

/* ── Creator-only product management ── */

describe('POST /shop/products', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/shop/products')
      .send({ name: 'Test Product', priceCents: 1999 });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/shop/products')
      .set('Authorization', 'Bearer invalid')
      .send({ name: 'Test Product', priceCents: 1999 });
    expect(res.status).toBe(401);
  });
});

describe('PUT /shop/products/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .put('/shop/products/abc123')
      .send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /shop/products/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .delete('/shop/products/abc123');
    expect(res.status).toBe(401);
  });
});

/* ── Auctions ── */

describe('POST /shop/auctions', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/shop/auctions')
      .send({ title: 'Test Auction', startingBidCents: 500 });
    expect(res.status).toBe(401);
  });
});

describe('POST /shop/auctions/:id/bid', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/shop/auctions/abc123/bid')
      .send({ bidCents: 1000 });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/shop/auctions/abc123/bid')
      .set('Authorization', 'Bearer bogus')
      .send({ bidCents: 1000 });
    expect(res.status).toBe(401);
  });
});

describe('POST /shop/auctions/:id/end', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/shop/auctions/abc123/end');
    expect(res.status).toBe(401);
  });
});
