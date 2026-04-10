/**
 * TV API route tests — Vitest + Supertest
 * Tests /tv/* endpoints for auth guards and input validation.
 * Auth is checked via x-user-id header (or req.user); pairing/device endpoints are guarded.
 * Read-only browse endpoints (channels, schedule, streams) are public.
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
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/millo_test';

  const { tvRoutes } = await import('../routes/tv.js');
  app = Fastify({ logger: false });
  await tvRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Pairing: create code (auth required) ── */

describe('POST /tv/pairing/code', () => {
  it('returns 401 without x-user-id header', async () => {
    const res = await request(server).post('/tv/pairing/code');
    expect(res.status).toBe(401);
  });

  it('returns 401 with no auth and no body', async () => {
    const res = await request(server)
      .post('/tv/pairing/code')
      .send({});
    expect(res.status).toBe(401);
  });
});

/* ── Pairing: link device (no auth, but requires code + deviceId + platform) ── */

describe('POST /tv/pairing/link', () => {
  it('returns 400 when body is empty', async () => {
    const res = await request(server)
      .post('/tv/pairing/link')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(server)
      .post('/tv/pairing/link')
      .send({ deviceId: 'dev1', platform: 'appletv' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when deviceId is missing', async () => {
    const res = await request(server)
      .post('/tv/pairing/link')
      .send({ code: 'ABC123', platform: 'appletv' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when platform is missing', async () => {
    const res = await request(server)
      .post('/tv/pairing/link')
      .send({ code: 'ABC123', deviceId: 'dev1' });
    expect(res.status).toBe(400);
  });

  it('error body contains MISSING_CODE_DEVICE_OR_PLATFORM when all fields absent', async () => {
    const res = await request(server)
      .post('/tv/pairing/link')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'MISSING_CODE_DEVICE_OR_PLATFORM');
  });
});

/* ── Read-only: channels (public) ── */

describe('GET /tv/channels', () => {
  it('is a public route — no auth required', async () => {
    const res = await request(server).get('/tv/channels');
    expect([200, 500]).toContain(res.status);
  });

  it('returns a JSON body', async () => {
    const res = await request(server).get('/tv/channels');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('on success (200) response is an array', async () => {
    const res = await request(server).get('/tv/channels');
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

/* ── Read-only: schedule for a channel (public) ── */

describe('GET /tv/channels/:channelId/schedule', () => {
  it('is a public route — no auth required', async () => {
    const res = await request(server).get('/tv/channels/ch123/schedule');
    expect([200, 500]).toContain(res.status);
  });

  it('on success (200) response is an array', async () => {
    const res = await request(server).get('/tv/channels/ch123/schedule');
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

/* ── Read-only: live streams (public) ── */

describe('GET /tv/streams', () => {
  it('is a public route — no auth required', async () => {
    const res = await request(server).get('/tv/streams');
    expect([200, 500]).toContain(res.status);
  });

  it('on success (200) response is an array', async () => {
    const res = await request(server).get('/tv/streams');
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

/* ── Paired devices (auth required) ── */

describe('GET /tv/devices', () => {
  it('returns 401 without x-user-id header', async () => {
    const res = await request(server).get('/tv/devices');
    expect(res.status).toBe(401);
  });

  it('returns 401 error body with UNAUTHORIZED', async () => {
    const res = await request(server).get('/tv/devices');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
  });
});
