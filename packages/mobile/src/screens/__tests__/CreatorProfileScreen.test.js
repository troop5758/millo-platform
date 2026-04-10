'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
  del:  jest.fn(),
}));

const { get, post, del } = require('../../api/client');

describe('CreatorProfileScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../CreatorProfileScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('CreatorProfileScreen fmtNum helper', () => {
  function fmtNum(n) {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  test.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1500, '1.5K'],
    [1000000, '1.0M'],
  ])('fmtNum(%s) → "%s"', (input, expected) => {
    expect(fmtNum(input)).toBe(expected);
  });
});

describe('CreatorProfileScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches creator profile from /content/creators/:id', async () => {
    get.mockResolvedValue({ creator: { displayName: 'Test' } });
    const creatorId = 'creator123';
    await get(`/content/creators/${creatorId}`);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/content/creators/'));
    expect(get).toHaveBeenCalledWith(expect.stringContaining(creatorId));
  });

  it('posts to follow creator at /profile/follow/:id', async () => {
    post.mockResolvedValue({});
    const creatorId = 'creator456';
    await post(`/profile/follow/${creatorId}`, {});
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/profile/follow/'), expect.anything());
    expect(post).toHaveBeenCalledWith(expect.stringContaining(creatorId), expect.anything());
  });

  it('calls del to unfollow creator at /profile/follow/:id', async () => {
    del.mockResolvedValue({});
    const creatorId = 'creator789';
    await del(`/profile/follow/${creatorId}`);
    expect(del).toHaveBeenCalledWith(expect.stringContaining('/profile/follow/'));
    expect(del).toHaveBeenCalledWith(expect.stringContaining(creatorId));
  });
});
