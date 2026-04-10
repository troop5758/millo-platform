/**
 * DM API integration tests — Vitest + Supertest
 * Tests the /dm/* endpoints against an in-memory Fastify app instance.
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

/* ── Unauthenticated app (no request.user) ── */
let app;
let server;

/* ── Authenticated app (mock user injected via preHandler) ── */
let authedApp;
let authedServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { dmRoutes } = await import('../routes/dm.js');

  app = Fastify({ logger: false });
  await dmRoutes(app);
  await app.ready();
  server = app.server;

  authedApp = Fastify({ logger: false });
  authedApp.addHook('preHandler', async (req) => {
    req.user = { _id: 'mock_user_000000000001' };
  });
  await dmRoutes(authedApp);
  await authedApp.ready();
  authedServer = authedApp.server;
});

afterAll(async () => {
  await app?.close();
  await authedApp?.close();
});

/* ── Auth guard tests (unauthenticated) ── */

describe('GET /dm/conversations', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/dm/conversations');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /dm/messages — auth guard', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/dm/messages')
      .send({ receiverId: 'abc123', body: 'hello' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /dm/conversation/:userId/messages', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/dm/conversation/someuser123/messages');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /dm/messages/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).delete('/dm/messages/nonexistentid');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /dm/read/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/dm/read/someuser123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

/* ── Input validation tests (authenticated) ── */

describe('POST /dm/messages — input validation', () => {
  it('returns 400 when receiverId is missing', async () => {
    const res = await request(authedServer)
      .post('/dm/messages')
      .send({ body: 'hello there' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('RECEIVER_REQUIRED');
  });

  it('returns 400 when body is missing', async () => {
    const res = await request(authedServer)
      .post('/dm/messages')
      .send({ receiverId: 'somereceiveruid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BODY_REQUIRED');
  });

  it('returns 400 when body is empty string', async () => {
    const res = await request(authedServer)
      .post('/dm/messages')
      .send({ receiverId: 'somereceiveruid', body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BODY_REQUIRED');
  });

  it('returns 400 when body exceeds 10,000 characters', async () => {
    const res = await request(authedServer)
      .post('/dm/messages')
      .send({ receiverId: 'somereceiveruid', body: 'x'.repeat(10001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BODY_TOO_LONG');
  });
});
