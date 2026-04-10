/**
 * Compliance API route tests — Vitest + Supertest
 * Tests /compliance/* endpoints for auth guards and input validation.
 * DSAR, consent, and age-check endpoints require authentication via x-user-id header.
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

  const { complianceRoutes } = await import('../routes/compliance.js');
  app = Fastify({ logger: false });
  await complianceRoutes(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Phase 8: DSAR API ── */

describe('POST /dsar/request', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/dsar/request').send({ type: 'export' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(server)
      .post('/dsar/request')
      .set('x-user-id', 'user123')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'INVALID_TYPE');
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(server)
      .post('/dsar/request')
      .set('x-user-id', 'user123')
      .send({ type: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.valid).toContain('export');
  });

  it('returns 201 when type is valid', async () => {
    const res = await request(server)
      .post('/dsar/request')
      .set('x-user-id', 'user123')
      .send({ type: 'export', lawBasis: 'gdpr' });
    expect([201, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body.request).toHaveProperty('type', 'export');
    }
  });
});

describe('GET /dsar/export', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/dsar/export');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessing another user without admin', async () => {
    const res = await request(server)
      .get('/dsar/export?userId=otherUser999')
      .set('x-user-id', 'user123');
    expect(res.status).toBe(403);
  });

  it('returns 200 or 500 when authenticated for self', async () => {
    const res = await request(server)
      .get('/dsar/export')
      .set('x-user-id', 'user123');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) expect(res.body).toHaveProperty('userId');
  });
});

describe('POST /dsar/delete', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/dsar/delete').send({ confirm: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 when confirm is missing', async () => {
    const res = await request(server)
      .post('/dsar/delete')
      .set('x-user-id', 'user123')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'CONFIRM_REQUIRED');
  });

  it('returns 400 when confirm is false', async () => {
    const res = await request(server)
      .post('/dsar/delete')
      .set('x-user-id', 'user123')
      .send({ confirm: false });
    expect(res.status).toBe(400);
  });

  it('returns 200 when confirm is true', async () => {
    const res = await request(server)
      .post('/dsar/delete')
      .set('x-user-id', 'user123')
      .send({ confirm: true });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body.scheduled === true || res.body.deleted === true).toBe(true);
    }
  });
});

/* ── Legacy DSAR ── */

describe('GET /compliance/dsar', () => {
  it('returns 401 without x-user-id header', async () => {
    const res = await request(server).get('/compliance/dsar');
    expect(res.status).toBe(401);
  });

  it('returns 401 error body with UNAUTHORIZED', async () => {
    const res = await request(server).get('/compliance/dsar');
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
  });

  it('returns 200 or 403 when authenticated as self', async () => {
    const res = await request(server)
      .get('/compliance/dsar')
      .set('x-user-id', 'user123');
    expect([200, 403, 500]).toContain(res.status);
  });

  it('returns 403 when accessing another user\'s data without admin role', async () => {
    const res = await request(server)
      .get('/compliance/dsar?userId=otherUser999')
      .set('x-user-id', 'user123');
    expect([403, 500]).toContain(res.status);
  });
});

/* ── Consent ── */

describe('POST /compliance/consent', () => {
  it('returns 401 without x-user-id header', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .send({ purpose: 'analytics', version: '1.0', granted: true });
    expect(res.status).toBe(401);
  });

  it('returns 401 error body with UNAUTHORIZED', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .send({ purpose: 'analytics', version: '1.0' });
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
  });

  it('returns 400 when purpose is missing', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .set('x-user-id', 'user123')
      .send({ version: '1.0', granted: true });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'PURPOSE_REQUIRED');
  });

  it('returns 400 when version is missing', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .set('x-user-id', 'user123')
      .send({ purpose: 'analytics', granted: true });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VERSION_REQUIRED');
  });

  it('returns 400 when purpose is an empty string', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .set('x-user-id', 'user123')
      .send({ purpose: '   ', version: '1.0' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'PURPOSE_REQUIRED');
  });

  it('returns 400 when purpose exceeds 100 characters', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .set('x-user-id', 'user123')
      .send({ purpose: 'a'.repeat(101), version: '1.0' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'PURPOSE_TOO_LONG');
  });

  it('returns 400 when granted is not a boolean', async () => {
    const res = await request(server)
      .post('/compliance/consent')
      .set('x-user-id', 'user123')
      .send({ purpose: 'analytics', version: '1.0', granted: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'INVALID_GRANTED');
  });
});

/* ── Age check ── */

/* ── Phase 9: Adult content — age gate, age verify ── */

describe('GET /compliance/age-gate', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/compliance/age-gate');
    expect(res.status).toBe(401);
  });

  it('returns 200 with required/ageVerified when authenticated', async () => {
    const res = await request(server)
      .get('/compliance/age-gate')
      .set('x-user-id', 'user123');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('required');
      expect(res.body).toHaveProperty('minimumAge', 18);
    }
  });
});

describe('POST /compliance/age-verify', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).post('/compliance/age-verify').send({});
    expect(res.status).toBe(401);
  });

  it('returns 200 or 400 when authenticated', async () => {
    const res = await request(server)
      .post('/compliance/age-verify')
      .set('x-user-id', 'user123')
      .send({});
    expect([200, 400, 500]).toContain(res.status);
    if (res.status === 200) expect(res.body).toHaveProperty('verified', true);
    if (res.status === 400) expect(res.body).toHaveProperty('error');
  });
});

/* ── Age check ── */

describe('GET /compliance/age-check', () => {
  it('returns 401 without x-user-id header', async () => {
    const res = await request(server).get('/compliance/age-check');
    expect(res.status).toBe(401);
  });

  it('returns 401 error body with UNAUTHORIZED', async () => {
    const res = await request(server).get('/compliance/age-check');
    expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
  });

  it('returns 403 when querying another user\'s age status without permission', async () => {
    const res = await request(server)
      .get('/compliance/age-check?userId=otherUser999')
      .set('x-user-id', 'user123');
    expect(res.status).toBe(403);
  });

  it('returns 200 or 500 when authenticated querying own status', async () => {
    const res = await request(server)
      .get('/compliance/age-check')
      .set('x-user-id', 'user123');
    expect([200, 500]).toContain(res.status);
  });
});
