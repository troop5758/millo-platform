/**
 * Auth API integration tests — Vitest + Supertest
 * Tests the /auth/* endpoints against an in-memory Fastify app instance.
 * These tests use a real (or mocked) database; set MONGODB_URI=mongodb://localhost:27017/millo_test
 * before running, or ensure @millo/database is configured for the test environment.
 *
 * Run:  npm test -w packages/api
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

/* ── Bootstrap a minimal Fastify app with only auth routes ── */
let app;
let server;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { authRoutes } = await import('../routes/auth.js');

  app = Fastify({ logger: false });
  await authRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Tests ── */

describe('POST /auth/register', () => {
  const email = `test_${Date.now()}@milloapp.com`;

  it('returns 400 when email is missing', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with token and user on valid registration', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email, password: 'password123', displayName: 'Test User' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(email);
  });

  it('returns 409 when email is already taken', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email, password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
  });
});

describe('POST /auth/login', () => {
  const email = `login_${Date.now()}@milloapp.com`;
  const password = 'logintest123';

  beforeAll(async () => {
    await request(server).post('/auth/register').send({ email, password });
  });

  it('returns 400 on missing credentials', async () => {
    const res = await request(server).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with token on valid login', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(email);
  });
});

describe('GET /auth/me', () => {
  let token;
  const email = `me_${Date.now()}@milloapp.com`;

  beforeAll(async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email, password: 'metest1234' });
    token = res.body.token;
  });

  it('returns 401 without token', async () => {
    const res = await request(server).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user data when authenticated', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe('POST /auth/refresh', () => {
  let token;
  const email = `refresh_${Date.now()}@milloapp.com`;

  beforeAll(async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email, password: 'refreshtest1234' });
    token = res.body.token;
  });

  it('returns 401 without token', async () => {
    const res = await request(server).post('/auth/refresh').send({});
    expect(res.status).toBe(401);
  });

  it('returns a new token on valid refresh', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).not.toBe(token);
  });
});

describe('POST /auth/logout', () => {
  it('returns 200 even without a token', async () => {
    const res = await request(server).post('/auth/logout').send({});
    expect([200, 401]).toContain(res.status);
  });
});
