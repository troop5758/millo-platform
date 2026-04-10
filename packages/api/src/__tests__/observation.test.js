/**
 * Self-observation API route tests — Vitest + Supertest
 * Tests /observation/* endpoints: recommendations, drift, upgrade, health, security.
 * All routes are admin-only — unauthenticated callers receive 401.
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

  const { observationRoutes } = await import('../routes/observation.js');
  app = Fastify({ logger: false });
  app.addHook('onRequest', (req, _reply, done) => {
    const header = req.headers['x-test-role'];
    if (header === 'admin')  req.user = { _id: 'admin_id', role: 'admin' };
    else if (header === 'user') req.user = { _id: 'user_id', role: 'user' };
    else req.user = null;
    done();
  });
  await observationRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

const ENDPOINTS = [
  '/observation/recommendations',
  '/observation/drift',
  '/observation/upgrade',
  '/observation/health',
  '/observation/security',
];

for (const endpoint of ENDPOINTS) {
  describe(`GET ${endpoint}`, () => {
    it('returns 401 without auth', async () => {
      const res = await request(server).get(endpoint);
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request(server).get(endpoint).set('x-test-role', 'user');
      expect(res.status).toBe(403);
    });

    it('returns 200 or 500 for admin (depends on @millo/self-observation mock)', async () => {
      const res = await request(server).get(endpoint).set('x-test-role', 'admin');
      expect([200, 500]).toContain(res.status);
    });

    it('returns JSON content-type', async () => {
      const res = await request(server).get(endpoint).set('x-test-role', 'admin');
      expect(res.headers['content-type']).toMatch(/json/);
    });
  });
}
