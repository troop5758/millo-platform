/**
 * Live API route tests — Vitest + Supertest
 * Tests the /live/* endpoints for auth guards and public access.
 * Verifies the 6 routes fixed for auth (POST /live/start, /end, /moderate, /milla/*).
 *
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';
import FastifyWebsocket from '@fastify/websocket';

let app;
let server;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { liveRoutes } = await import('../routes/live.js');
  app = Fastify({ logger: false });
  await app.register(FastifyWebsocket);
  await liveRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Public / unauthenticated endpoints ── */

describe('GET /live/stream/:streamId', () => {
  it('returns 404 for nonexistent stream', async () => {
    const res = await request(server).get('/live/stream/000000000000000000000001');
    expect(res.status).toBe(404);
  });
});

describe('GET /live/filters/status', () => {
  it('returns 200 with filters status', async () => {
    const res = await request(server).get('/live/filters/status');
    expect(res.status).toBe(200);
  });
});

describe('GET /live/filters/list', () => {
  it('returns 200 with filters list', async () => {
    const res = await request(server).get('/live/filters/list');
    expect(res.status).toBe(200);
  });
});

describe('GET /live/milla/status/:streamId', () => {
  it('returns 404 or 200 for any stream ID', async () => {
    const res = await request(server).get('/live/milla/status/000000000000000000000001');
    expect([200, 404]).toContain(res.status);
  });
});

/* ── Auth-protected endpoints (the 6 routes we secured) ── */

describe('POST /live/start', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/start')
      .send({ userId: 'abc', title: 'My Stream' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/live/start')
      .set('Authorization', 'Bearer invalid-token')
      .send({ userId: 'abc', title: 'My Stream' });
    expect(res.status).toBe(401);
  });
});

describe('POST /live/end/:streamId', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/end/000000000000000000000001');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/live/end/000000000000000000000001')
      .set('Authorization', 'Bearer bogus');
    expect(res.status).toBe(401);
  });
});

describe('POST /live/moderate', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/moderate')
      .send({ streamId: 'abc', action: 'mute', targetUserId: 'xyz' });
    expect(res.status).toBe(401);
  });
});

describe('POST /live/milla/cohost', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/milla/cohost')
      .send({ streamId: 'abc', enabled: true });
    expect(res.status).toBe(401);
  });
});

describe('POST /live/milla/mute', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/milla/mute')
      .send({ streamId: 'abc', muted: true });
    expect(res.status).toBe(401);
  });
});

describe('POST /live/milla/gift', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(server)
      .post('/live/milla/gift')
      .send({ streamId: 'abc', giftType: 'rose' });
    expect(res.status).toBe(401);
  });
});

/* ── Join / heartbeat / leave (should require auth) ── */

describe('POST /live/join', () => {
  it('returns 400 or 401 without streamId', async () => {
    const res = await request(server)
      .post('/live/join')
      .send({});
    expect([400, 401]).toContain(res.status);
  });
});

describe('GET /live/stream/:streamId/key', () => {
  it('returns 401, 403, or 404 without auth', async () => {
    const res = await request(server)
      .get('/live/stream/000000000000000000000001/key');
    expect([401, 403, 404]).toContain(res.status);
  });
});
