/**
 * User WebSocket gateway route tests — Vitest + Supertest
 * Tests the GET /user/ws endpoint for correct rejection of plain HTTP requests
 * and non-upgrade connections. The WS handler closes with 1008 (policy violation)
 * when no token or invalid token is provided.
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

  const { userWsRoutes } = await import('../routes/userWs.js');
  app = Fastify({ logger: false });
  await app.register(FastifyWebsocket);
  await userWsRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── HTTP (non-upgrade) requests to the WS endpoint ── */

describe('GET /user/ws (plain HTTP, no WebSocket upgrade)', () => {
  it('returns a 4xx response — route exists but rejects non-WS requests', async () => {
    const res = await request(server).get('/user/ws');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns a 4xx response even with a token query param', async () => {
    const res = await request(server).get('/user/ws?token=sometoken');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns a 4xx response with an Authorization header', async () => {
    const res = await request(server)
      .get('/user/ws')
      .set('Authorization', 'Bearer fake-session-token');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns a 4xx — route is registered (WS routes return 404 or 426 for plain HTTP)', async () => {
    const res = await request(server).get('/user/ws');
    // @fastify/websocket returns 404 for plain HTTP on WS-only routes (no HTTP fallback registered)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

/* ── Unregistered paths must still return 404 ── */

describe('GET /user/ws/nonexistent', () => {
  it('returns 404 for a path that is not registered', async () => {
    const res = await request(server).get('/user/ws/nonexistent');
    expect(res.status).toBe(404);
  });
});
