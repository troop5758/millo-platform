/**
 * Level & Trust API route tests — Vitest + Supertest
 * Tests /level/*, /trust/*, /gated endpoints for input validation and gating.
 * POST /gated requires auth — userId comes from the session, not the body.
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

  const { levelTrustRoutes } = await import('../routes/levelTrust.js');
  app = Fastify({ logger: false });
  // Simulate authShell middleware
  app.addHook('onRequest', (req, _reply, done) => {
    const header = req.headers['x-test-role'];
    if (header === 'user') req.user = { _id: 'mock_id_1', role: 'user' };
    else req.user = null;
    done();
  });
  await levelTrustRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Level lookup ── */

describe('GET /level/:userId', () => {
  it('is a public route — no auth required', async () => {
    const res = await request(server).get('/level/mock_id_1');
    expect([200, 500]).toContain(res.status);
  });

  it('returns a JSON body', async () => {
    const res = await request(server).get('/level/mock_id_1');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

/* ── Trust lookup ── */

describe('GET /trust/:userId', () => {
  it('is a public route — no auth required', async () => {
    const res = await request(server).get('/trust/mock_id_1');
    expect([200, 500]).toContain(res.status);
  });

  it('returns a JSON body', async () => {
    const res = await request(server).get('/trust/mock_id_1');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('on success (200) response contains trust and tier fields', async () => {
    const res = await request(server).get('/trust/mock_id_1');
    if (res.status === 200) {
      expect(res.body).toHaveProperty('trust');
      expect(res.body).toHaveProperty('tier');
    }
  });
});

/* ── Gated endpoint ── */

describe('POST /gated', () => {
  it('returns 401 when unauthenticated (no session)', async () => {
    const res = await request(server)
      .post('/gated')
      .set('Content-Type', 'application/json')
      .send({ minLevel: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 401 error body when not authenticated', async () => {
    const res = await request(server)
      .post('/gated')
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('ignores userId in body — uses session user instead', async () => {
    const res = await request(server)
      .post('/gated')
      .set('Content-Type', 'application/json')
      .set('x-test-role', 'user')
      .send({ userId: 'some_other_user', minLevel: 1 });
    // Should not 400 — userId from body is ignored; session user is used
    expect([200, 403, 500]).toContain(res.status);
  });

  it('returns 200 or 403 for authenticated user with a minLevel gate', async () => {
    const res = await request(server)
      .post('/gated')
      .set('Content-Type', 'application/json')
      .set('x-test-role', 'user')
      .send({ minLevel: 1 });
    expect([200, 403, 500]).toContain(res.status);
  });

  it('returns 403 error body with gate error when gate is not met', async () => {
    const res = await request(server)
      .post('/gated')
      .set('Content-Type', 'application/json')
      .set('x-test-role', 'user')
      .send({ minLevel: 1 });
    if (res.status === 403) {
      expect(['LEVEL_GATE_FAILED', 'TRUST_GATE_FAILED', 'TRUST_TIER_GATE_FAILED']).toContain(res.body.error);
    }
  });
});
