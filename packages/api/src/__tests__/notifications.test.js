/**
 * Notifications API integration tests — Vitest + Supertest
 * Tests the /notifications/* endpoints against an in-memory Fastify app instance.
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

/* ── App with no auth headers (unauthenticated) ── */
let app;
let server;

/* ── App with req.user = admin (for send-email validation tests) ── */
let adminApp;
let adminServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { notificationsRoutes } = await import('../routes/notifications.js');

  app = Fastify({ logger: false });
  await notificationsRoutes(app);
  await app.ready();
  server = app.server;

  adminApp = Fastify({ logger: false });
  adminApp.addHook('preHandler', async (req) => {
    req.user = { _id: 'mock_admin_000000000001', role: 'admin' };
  });
  await notificationsRoutes(adminApp);
  await adminApp.ready();
  adminServer = adminApp.server;
});

afterAll(async () => {
  await app?.close();
  await adminApp?.close();
});

/* ── Auth guard tests ── */

describe('GET /notifications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/notifications');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 200 with x-user-id header', async () => {
    const res = await request(server)
      .get('/notifications')
      .set('x-user-id', 'someuser123');
    expect(res.status).toBe(200);
  });
});

describe('GET /notifications/unread-count', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/notifications/unread-count');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /notifications/:id/read', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/notifications/somenotifid/read');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /notifications/push-token', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/notifications/push-token')
      .send({ token: 'ExponentPushToken[xxx]' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 400 when token field is missing', async () => {
    const res = await request(server)
      .post('/notifications/push-token')
      .set('x-user-id', 'someuser123')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TOKEN_REQUIRED');
  });
});

describe('DELETE /notifications/push-token', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .delete('/notifications/push-token')
      .send({ token: 'ExponentPushToken[xxx]' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 400 when token field is missing', async () => {
    const res = await request(server)
      .delete('/notifications/push-token')
      .set('x-user-id', 'someuser123')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TOKEN_REQUIRED');
  });
});

/* ── Role guard tests ── */

describe('POST /notifications/send-email — role guard', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/notifications/send-email')
      .send({ to: 'user@example.com', body: 'Hello' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 403 for non-admin user (via x-user-id, no role)', async () => {
    const res = await request(server)
      .post('/notifications/send-email')
      .set('x-user-id', 'regularuser123')
      .send({ to: 'user@example.com', body: 'Hello' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

/* ── Input validation tests (admin authenticated) ── */

describe('POST /notifications/send-email — input validation', () => {
  it('returns 400 when to field is missing', async () => {
    const res = await request(adminServer)
      .post('/notifications/send-email')
      .send({ body: 'Hello world' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TO');
  });

  it('returns 400 when to field is not a valid email', async () => {
    const res = await request(adminServer)
      .post('/notifications/send-email')
      .send({ to: 'notanemail', body: 'Hello world' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TO');
  });

  it('returns 400 when body field is missing', async () => {
    const res = await request(adminServer)
      .post('/notifications/send-email')
      .send({ to: 'user@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BODY_REQUIRED');
  });

  it('returns 400 when body is empty string', async () => {
    const res = await request(adminServer)
      .post('/notifications/send-email')
      .send({ to: 'user@example.com', body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BODY_REQUIRED');
  });
});

/* ── Public route tests ── */

describe('GET /notifications/push-payload', () => {
  it('returns 200 with a payload object (no auth required)', async () => {
    const res = await request(server)
      .get('/notifications/push-payload')
      .query({ title: 'Test', body: 'Hello' });
    expect(res.status).toBe(200);
  });
});
