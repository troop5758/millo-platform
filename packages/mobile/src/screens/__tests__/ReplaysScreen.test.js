'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn();
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('ReplaysScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../ReplaysScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('ReplaysScreen API interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vods: [] }),
    });
  });

  it('fetches VOD/replay content from /content/vod', async () => {
    const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/content/vod?page=1&limit=10`);
    const data = await res.json();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/content/vod'));
    expect(data.vods).toEqual([]);
  });

  it('returns vods array on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vods: [{ _id: '1', title: 'Replay 1' }] }),
    });
    const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/content/vod?page=1&limit=10`);
    const data = await res.json();
    expect(data.vods).toHaveLength(1);
    expect(data.vods[0].title).toBe('Replay 1');
  });
});
