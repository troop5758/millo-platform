/**
 * Public ticket tracking — GET /ticket/:trackingId (SupportTicket lookup, safe DTO).
 * https://milloapp.com
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

const findOneMock = vi.fn();

vi.mock('@millo/database', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    SupportTicket: {
      ...actual.SupportTicket,
      findOne: (...args) => findOneMock(...args),
    },
  };
});

let app;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const { supportRoutes } = await import('../routes/support.js');
  app = Fastify({ logger: false });
  await supportRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  vi.resetAllMocks();
});

beforeEach(() => {
  findOneMock.mockReset();
});

describe('GET /ticket/:trackingId', () => {
  it('returns 400 when tracking id empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/ticket/   ' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('TRACKING_ID_REQUIRED');
  });

  it('returns 404 when no SupportTicket matches', async () => {
    findOneMock.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await app.inject({ method: 'GET', url: '/ticket/MIL-missing' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('TICKET_NOT_FOUND');
    expect(findOneMock).toHaveBeenCalled();
  });

  it('returns safe payload when ticket exists', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      ticketNumber: 'MIL-99-testnum',
      trackingId: 'MIL-99-testtrk',
      subject: 'Need help',
      status: 'OPEN',
      slaRespondBy: new Date('2026-01-01T12:00:00Z'),
      slaResolveBy: new Date('2026-01-02T12:00:00Z'),
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
      issueType: 'OTHER',
      trackingStatus: 'PENDING',
    };
    findOneMock.mockReturnValue({ lean: () => Promise.resolve(doc) });
    const res = await app.inject({ method: 'GET', url: '/ticket/MIL-99-testnum' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ticketNumber).toBe('MIL-99-testnum');
    expect(body.trackingId).toBe('MIL-99-testtrk');
    expect(body.subject).toBe('Need help');
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('messages');
    expect(body.sla).toEqual(
      expect.objectContaining({
        responseDue: doc.slaRespondBy.toISOString(),
        resolutionDue: doc.slaResolveBy.toISOString(),
      })
    );
  });
});
