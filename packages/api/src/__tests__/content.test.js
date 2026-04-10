/**
 * Content API route tests — Vitest + Supertest
 * Tests the /content/* endpoints for auth guards, input validation, and public access.
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

  const { contentRoutes } = await import('../routes/content.js');
  app = Fastify({ logger: false });
  await contentRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Public endpoints ── */

describe('GET /content/streams', () => {
  it('returns 200 with streams array', async () => {
    const res = await request(server).get('/content/streams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('streams');
    expect(Array.isArray(res.body.streams)).toBe(true);
  });

  it('accepts status filter', async () => {
    const res = await request(server).get('/content/streams?status=live');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('streams');
  });

  it('accepts limit and offset', async () => {
    const res = await request(server).get('/content/streams?limit=5&offset=0');
    expect(res.status).toBe(200);
  });
});

describe('GET /content/search', () => {
  it('returns 200 with results structure', async () => {
    const res = await request(server).get('/content/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('streams');
    expect(res.body).toHaveProperty('products');
  });

  it('returns 200 with empty results when query is missing', async () => {
    const res = await request(server).get('/content/search');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /content/search/advanced', () => {
  it('mirrors search with advanced flag; empty q uses trending fallback', async () => {
    const res = await request(server).get('/content/search/advanced');
    expect(res.status).toBe(200);
    expect(res.body.searchMode).toBe('advanced');
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('users');
  });
});

describe('GET /content/creators/:id', () => {
  it('returns 404 for nonexistent creator', async () => {
    const res = await request(server).get('/content/creators/000000000000000000000001');
    expect(res.status).toBe(404);
  });
});

describe('GET /content/vod', () => {
  it('returns 200 with vods array', async () => {
    const res = await request(server).get('/content/vod');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('vods');
    expect(Array.isArray(res.body.vods)).toBe(true);
  });

  it('accepts pagination params', async () => {
    const res = await request(server).get('/content/vod?limit=10&offset=0');
    expect(res.status).toBe(200);
  });
});

describe('GET /content/streams/:id', () => {
  it('returns 404 for nonexistent stream', async () => {
    const res = await request(server).get('/content/streams/000000000000000000000001');
    expect(res.status).toBe(404);
  });
});

/* ── Auth-protected endpoints ── */

describe('GET /content/notifications', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server).get('/content/notifications');
    expect(res.status).toBe(401);
  });
});

describe('POST /content/notifications/read', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/content/notifications/read')
      .send({ ids: [] });
    expect(res.status).toBe(401);
  });
});

describe('GET /content/analytics/me', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server).get('/content/analytics/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /content/wallet', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server).get('/content/wallet');
    expect(res.status).toBe(401);
  });
});

describe('POST /content/gifts/send', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/content/gifts/send')
      .send({ streamId: 'abc', giftType: 'rose' });
    expect(res.status).toBe(401);
  });
});

describe('POST /content/streams/start', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/content/streams/start')
      .send({ title: 'Test Stream' });
    expect(res.status).toBe(401);
  });
});

describe('POST /content/streams/:id/stop', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/content/streams/abc123/stop');
    expect(res.status).toBe(401);
  });
});

describe('PUT /content/profile', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .put('/content/profile')
      .send({ displayName: 'Test' });
    expect(res.status).toBe(401);
  });
});
