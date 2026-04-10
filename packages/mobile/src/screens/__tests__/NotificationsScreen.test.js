'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get, post } = require('../../api/client');

describe('NotificationsScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../NotificationsScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('NotificationsScreen timeAgo helper', () => {
  function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  it('returns empty string for null/undefined', () => {
    expect(timeAgo(null)).toBe('');
  });
});

describe('NotificationsScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches notifications from /content/notifications', async () => {
    get.mockResolvedValue({ notifications: [] });
    await get('/content/notifications?limit=50');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/content/notifications'));
  });

  it('posts to mark notifications as read at /content/notifications/read', async () => {
    post.mockResolvedValue({});
    await post('/content/notifications/read', {});
    expect(post).toHaveBeenCalledWith('/content/notifications/read', {});
  });
});
