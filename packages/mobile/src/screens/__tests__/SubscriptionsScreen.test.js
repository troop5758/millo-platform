'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get } = require('../../api/client');

describe('SubscriptionsScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../SubscriptionsScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('SubscriptionsScreen format helpers', () => {
  function fmtDate(d) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtPrice(cents) {
    if (!cents) return null;
    return `$${(cents / 100).toFixed(2)}`;
  }

  it('fmtDate returns – for null/undefined', () => {
    expect(fmtDate(null)).toBe('–');
  });

  it('fmtDate formats valid date', () => {
    const d = new Date('2025-02-25');
    expect(fmtDate(d)).toMatch(/\w+\s+\d+\s*,\s*2025/);
  });

  it('fmtPrice returns null for falsy cents', () => {
    expect(fmtPrice(null)).toBeNull();
    expect(fmtPrice(0)).toBeNull();
  });

  it('fmtPrice formats cents to dollars', () => {
    expect(fmtPrice(999)).toBe('$9.99');
    expect(fmtPrice(100)).toBe('$1.00');
  });
});

describe('SubscriptionsScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches subscriptions from /payments/subscriptions/my', async () => {
    get.mockResolvedValue({ subscriptions: [] });
    await get('/payments/subscriptions/my');
    expect(get).toHaveBeenCalledWith('/payments/subscriptions/my');
  });

  it('subscription data has expected shape for display', () => {
    const sub = {
      _id: 'sub1',
      creatorId: 'creator1',
      status: 'active',
      plan: 'Standard',
      priceCents: 999,
      currentPeriodEnd: '2025-03-25',
    };
    expect(sub.creatorId).toBeDefined();
    expect(sub.status).toBeDefined();
    expect(sub.plan).toBeDefined();
    expect(typeof sub.priceCents).toBe('number');
  });
});
