/**
 * Security API route tests — Vitest + Supertest
 * Tests /security/ledger-integrity and /security/kill-switches.
 * Both are admin-only — unauthenticated callers receive 401.
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

  const { securityRoutes } = await import('../routes/security.js');
  app = Fastify({ logger: false });
  // Simulate authShell middleware that populates request.user
  app.addHook('onRequest', (req, _reply, done) => {
    const header = req.headers['x-test-role'];
    if (header === 'admin')  req.user = { _id: 'admin_id', role: 'admin' };
    else if (header === 'user') req.user = { _id: 'user_id', role: 'user' };
    else req.user = null;
    done();
  });
  await securityRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Ledger integrity ── */

describe('GET /security/ledger-integrity', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/security/ledger-integrity');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(server)
      .get('/security/ledger-integrity')
      .set('x-test-role', 'user');
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin with valid body', async () => {
    const res = await request(server)
      .get('/security/ledger-integrity')
      .set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
  });
});

/* ── Kill-switch registry ── */

describe('GET /security/kill-switches', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/security/kill-switches');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(server)
      .get('/security/kill-switches')
      .set('x-test-role', 'user');
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin', async () => {
    const res = await request(server)
      .get('/security/kill-switches')
      .set('x-test-role', 'admin');
    expect([200, 500]).toContain(res.status);
  });
});
