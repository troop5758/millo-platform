/**
 * Payments API route tests — Vitest + Supertest
 * Tests the /payments/* endpoints for auth guards and input validation.
 * Financial endpoints must never be accessible without a valid session.
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
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_payment_route_guards';

  const { paymentsRoutes } = await import('../routes/payments.js');
  const { paymentsModule } = await import('../payments/index.js');
  app = Fastify({ logger: false });
  await paymentsRoutes(app);
  await paymentsModule(app);
  await app.ready();
  server = app.server;
});

afterAll(async () => {
  await app?.close();
});

/* ── Coin purchase ── */

describe('POST /payments/coins/intent', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/coins/intent')
      .send({ packageId: 'starter' });
    expect(res.status).toBe(401);
  });
});

describe('POST /payments/coins/confirm', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/coins/confirm')
      .send({ paymentIntentId: 'pi_test' });
    expect(res.status).toBe(401);
  });
});

describe('POST /payments/coins/checkout-session', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/coins/checkout-session')
      .send({ packageId: 'starter' });
    expect(res.status).toBe(401);
  });
});

/* ── Subscriptions ── */

describe('POST /payments/subscriptions/creator', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/subscriptions/creator')
      .send({ creatorId: 'abc' });
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/subscriptions/creator/:creatorId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .get('/payments/subscriptions/creator/abc123');
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/subscriptions/my', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/payments/subscriptions/my');
    expect(res.status).toBe(401);
  });
});

describe('POST /payments/subscriptions/cancel', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/subscriptions/cancel')
      .send({ subscriptionId: 'sub_abc' });
    expect(res.status).toBe(401);
  });
});

/* ── Payouts ── */

describe('POST /payments/payouts/request', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/payouts/request')
      .send({ amountCents: 1000 });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/payments/payouts/request')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ amountCents: 1000 });
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/payouts/history', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/payments/payouts/history');
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/wallet/transactions', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/payments/wallet/transactions');
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/universal/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/payments/universal/507f1f77bcf86cd799439011');
    expect(res.status).toBe(401);
  });
});

describe('GET /payments/search', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server).get('/payments/search?reference=cs_test_1');
    expect(res.status).toBe(401);
  });
});

/* ── Admin payout management (requires staff token) ── */

describe('GET /payments/payouts/admin', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server).get('/payments/payouts/admin');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 401 or 403 with non-admin token', async () => {
    const res = await request(server)
      .get('/payments/payouts/admin')
      .set('Authorization', 'Bearer regular-user-token');
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /payments/payouts/:id/action', () => {
  it('returns 401 or 403 without auth', async () => {
    const res = await request(server)
      .post('/payments/payouts/abc123/action')
      .send({ action: 'approve' });
    expect([401, 403]).toContain(res.status);
  });
});

/* ── Shop checkout ── */

describe('POST /payments/shop/checkout', () => {
  it('returns 401 without auth', async () => {
    const res = await request(server)
      .post('/payments/shop/checkout')
      .send({ items: [], shippingAddress: {} });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(server)
      .post('/payments/shop/checkout')
      .set('Authorization', 'Bearer garbage')
      .send({ items: [], shippingAddress: {} });
    expect(res.status).toBe(401);
  });
});

/* ── Stripe webhook (special case — no auth, verifies Stripe signature) ── */

describe('POST /payments/webhooks/stripe', () => {
  it('returns 4xx without Stripe signature header', async () => {
    const res = await request(server)
      .post('/payments/webhooks/stripe')
      .send('{}');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
