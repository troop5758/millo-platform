/**
 * Moderation API integration tests — Vitest + Supertest
 * Tests the /moderation/* and /creators/* endpoints.
 * Auth routes are co-registered so real JWT tokens can be obtained
 * for role-guard and validation tests, matching the auth.test.js pattern.
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

let app;
let server;

/* Token belonging to a normal (non-admin) registered user */
let userToken;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { authRoutes }       = await import('../routes/auth.js');
  const { moderationRoutes } = await import('../routes/moderation.js');

  app = Fastify({ logger: false });
  await authRoutes(app);
  await moderationRoutes(app);
  await app.ready();
  server = app.server;

  /* Register a test user to get a valid non-admin token */
  const email = `modtest_${Date.now()}@milloapp.com`;
  const res = await request(server)
    .post('/auth/register')
    .send({ email, password: 'modtest1234', displayName: 'Mod Tester' });
  userToken = res.body?.token;
});

afterAll(async () => {
  await app?.close();
});

/* ── Auth guard tests (no token) ── */

describe('POST /moderation/report — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server)
      .post('/moderation/report')
      .send({ targetType: 'post', targetId: 'abc', reason: 'spam' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /moderation/reports — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server).get('/moderation/reports');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /moderation/reports/:id/action — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server)
      .post('/moderation/reports/somereportid/action')
      .send({ action: 'resolve' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('POST /creators/apply — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server)
      .post('/creators/apply')
      .send({ displayName: 'My Channel' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /creators/applications — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server).get('/creators/applications');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /creators/application/me — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(server).get('/creators/application/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

/* ── Admin-only routes: 403 for regular users ── */

describe('GET /moderation/reports — admin guard', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(server)
      .get('/moderation/reports')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('POST /moderation/reports/:id/action — admin guard', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(server)
      .post('/moderation/reports/somereportid/action')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'resolve' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('GET /creators/applications — admin guard', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await request(server)
      .get('/creators/applications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

/* ── Input validation tests (authenticated as regular user) ── */

describe('POST /moderation/report — input validation', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(server)
      .post('/moderation/report')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ targetType: 'post' }); // missing targetId and reason
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 201 when all required fields are provided', async () => {
    const res = await request(server)
      .post('/moderation/report')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ targetType: 'post', targetId: `target_${Date.now()}`, reason: 'spam' });
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('reportId');
    }
  });
});

describe('POST /creators/apply', () => {
  it('returns 201 on valid application', async () => {
    const res = await request(server)
      .post('/creators/apply')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ displayName: 'My Channel', bio: 'I make content', category: 'music' });
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('application');
    }
  });
});

describe('GET /creators/application/me', () => {
  it('returns 200 with application status for authenticated user', async () => {
    const res = await request(server)
      .get('/creators/application/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('creatorStatus');
  });
});
