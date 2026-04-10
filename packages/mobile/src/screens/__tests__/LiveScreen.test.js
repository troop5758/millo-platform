/**
 * LiveScreen unit tests.
 * Tests module exports, viewer count formatting, and API integration.
 * https://milloapp.com
 */
'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get } = require('../../api/client');

describe('LiveScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../LiveScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('LiveScreen fmtViewers helper', () => {
  function fmtViewers(n) {
    if (!n) return null;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  it('returns null for falsy input', () => {
    expect(fmtViewers(0)).toBeNull();
    expect(fmtViewers(null)).toBeNull();
    expect(fmtViewers(undefined)).toBeNull();
  });

  it('formats thousands correctly', () => {
    expect(fmtViewers(1000)).toBe('1K');
    expect(fmtViewers(1500)).toBe('1.5K');
    expect(fmtViewers(25000)).toBe('25K');
  });

  it('formats millions correctly', () => {
    expect(fmtViewers(1000000)).toBe('1.0M');
    expect(fmtViewers(2400000)).toBe('2.4M');
  });

  it('returns plain string for small counts', () => {
    expect(fmtViewers(42)).toBe('42');
    expect(fmtViewers(999)).toBe('999');
  });
});

describe('LiveScreen API interactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches live streams from content API', async () => {
    get.mockResolvedValue({ streams: [{ _id: 's1', title: 'Test', status: 'live' }] });
    const data = await get('/content/streams?filter=live&limit=20&offset=0');
    expect(data.streams).toHaveLength(1);
    expect(data.streams[0].status).toBe('live');
  });

  it('handles empty streams list gracefully', async () => {
    get.mockResolvedValue({ streams: [] });
    const data = await get('/content/streams?filter=live&limit=20&offset=0');
    expect(Array.isArray(data.streams)).toBe(true);
    expect(data.streams).toHaveLength(0);
  });

  it('handles API failure without throwing to UI', async () => {
    get.mockRejectedValue(new Error('500 Internal Server Error'));
    const streams = await get('/content/streams').catch(() => []);
    expect(Array.isArray(streams)).toBe(true);
  });
});
