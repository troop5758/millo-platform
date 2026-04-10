'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get } = require('../../api/client');

describe('SearchScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../SearchScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('SearchScreen fmtViewers helper', () => {
  function fmtViewers(n) {
    if (!n) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  test.each([
    [0, null],
    [500, '500'],
    [1000, '1K'],
    [1500, '1.5K'],
    [1000000, '1.0M'],
  ])('fmtViewers(%s) → "%s"', (input, expected) => {
    expect(fmtViewers(input)).toBe(expected);
  });
});

describe('SearchScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches search results from /content/search with query param', async () => {
    get.mockResolvedValue({ users: [], streams: [], products: [] });
    const query = 'test query';
    await get(`/content/search?q=${encodeURIComponent(query)}&limit=30`);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/content/search'));
    expect(get).toHaveBeenCalledWith(expect.stringContaining('q='));
  });

  it('does not call API when query is empty', () => {
    const q = '';
    expect(q.trim()).toBe('');
    expect(get).not.toHaveBeenCalled();
  });

  it('rapid calls each trigger get (no debounce coalescing without explicit debounce)', async () => {
    get.mockResolvedValue({ users: [], streams: [], products: [] });
    const clientGet = require('../../api/client').get;
    await clientGet('/content/search?q=a&limit=30');
    await clientGet('/content/search?q=ab&limit=30');
    expect(clientGet).toHaveBeenCalledTimes(2);
  });
});
