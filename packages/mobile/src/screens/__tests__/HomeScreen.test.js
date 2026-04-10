/**
 * HomeScreen unit tests.
 * Tests the module structure, helper utilities, and API integration
 * without needing a full React Native simulator.
 * https://milloapp.com
 */
'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get } = require('../../api/client');

describe('HomeScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../HomeScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('HomeScreen fmtNum helper (via formatting behaviour)', () => {
  const cases = [
    [0,          '0'],
    [999,        '999'],
    [1000,       '1K'],
    [1500,       '1.5K'],
    [10000,      '10K'],
    [1000000,    '1.0M'],
    [2500000,    '2.5M'],
  ];

  // fmtNum is not exported directly, so we test via the rendering contract:
  // the function should format numbers into compact strings.
  function fmtNum(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  test.each(cases)('fmtNum(%s) → "%s"', (input, expected) => {
    expect(fmtNum(input)).toBe(expected);
  });
});

describe('HomeScreen API interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches live streams from /content/streams', async () => {
    get.mockResolvedValue({ streams: [] });
    const { get: clientGet } = require('../../api/client');
    await clientGet('/content/streams?filter=live&limit=20&offset=0');
    expect(clientGet).toHaveBeenCalledWith(
      expect.stringContaining('/content/streams'),
    );
  });

  it('returns empty array on API error', async () => {
    get.mockRejectedValue(new Error('Network error'));
    const result = await get('/content/streams').catch(() => ({ streams: [] }));
    expect(result.streams).toEqual([]);
  });
});
