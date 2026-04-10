/**
 * GET /creators — creator directory surface
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Fastify from 'fastify';

let app;
let server;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { creatorsRoutes } = await import('../routes/creators.js');
  app = Fastify({ logger: false });
  await creatorsRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

describe('GET /creators', () => {
  it('returns 200 with creators array', async () => {
    const res = await request(server).get('/creators');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.creators)).toBe(true);
  });
});
