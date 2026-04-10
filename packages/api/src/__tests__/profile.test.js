/**
 * Profile API integration tests — Vitest + Supertest
 * Tests the /profile/* endpoints against an in-memory Fastify app instance.
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

  const { profileRoutes } = await import('../routes/profile.js');

  app = Fastify({ logger: false });
  await profileRoutes(app);
  await app.ready();
  server = app.server;

  authedApp = Fastify({ logger: false });
  authedApp.addHook('preHandler', async (req) => {
    req.user = { _id: 'mock_user_000000000001' };
  });
  await profileRoutes(authedApp);
  await authedApp.ready();
  authedServer = authedApp.server;
});

afterAll(async () => {
  await app?.close();
  await authedApp?.close();
});

/* ── Auth guard tests (unauthenticated) ── */

describe('PATCH /profile/me', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .patch('/profile/me')
      .send({ bio: 'hello' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /profile/follow/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/profile/follow/someuserid123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /profile/follow/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).delete('/profile/follow/someuserid123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /profile/block/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/profile/block/someuserid123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /profile/block/:userId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).delete('/profile/block/someuserid123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /profile/blocked', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/profile/blocked');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

/* ── Public routes (no auth required) ── */

describe('GET /profile/:userId/followers', () => {
  it('returns 200 without auth', async () => {
    const res = await request(server).get('/profile/someuserid123/followers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('followers');
    expect(Array.isArray(res.body.followers)).toBe(true);
  });
});

describe('GET /profile/:userId/following', () => {
  it('returns 200 without auth', async () => {
    const res = await request(server).get('/profile/someuserid123/following');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('following');
    expect(Array.isArray(res.body.following)).toBe(true);
  });
});

/* ── Input validation tests (authenticated) ── */

describe('PATCH /profile/me — input validation', () => {
  it('returns 400 when no recognized fields are provided', async () => {
    const res = await request(authedServer)
      .patch('/profile/me')
      .send({ unknownField: 'value' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOTHING_TO_UPDATE');
  });

  it('returns 400 when bio exceeds 500 characters', async () => {
    const res = await request(authedServer)
      .patch('/profile/me')
      .send({ bio: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BIO_TOO_LONG');
  });

  it('returns 400 when displayName exceeds 60 characters', async () => {
    const res = await request(authedServer)
      .patch('/profile/me')
      .send({ displayName: 'a'.repeat(61) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DISPLAY_NAME_TOO_LONG');
  });

  it('returns 400 when username has invalid format', async () => {
    const res = await request(authedServer)
      .patch('/profile/me')
      .send({ username: 'Invalid Username!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_USERNAME');
  });

  it('returns 400 when avatarUrl is not a valid URL', async () => {
    const res = await request(authedServer)
      .patch('/profile/me')
      .send({ avatarUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_AVATAR_URL');
  });
});

describe('POST /profile/follow/:userId', () => {
  it('returns 400 when attempting to follow self', async () => {
    const res = await request(authedServer).post('/profile/follow/mock_user_000000000001');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_FOLLOW_SELF');
  });
});

describe('POST /profile/block/:userId', () => {
  it('returns 400 when attempting to block self', async () => {
    const res = await request(authedServer).post('/profile/block/mock_user_000000000001');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_BLOCK_SELF');
  });
});
