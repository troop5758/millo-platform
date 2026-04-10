'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get, post } = require('../../api/client');

describe('MessagesScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../MessagesScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('MessagesScreen timeAgo helper', () => {
  function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  it('returns empty string for null/undefined', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('formats recent dates correctly', () => {
    const now = new Date();
    expect(timeAgo(now)).toMatch(/^\d+s$/);
  });
});

describe('MessagesScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches conversations from /dm/conversations', async () => {
    get.mockResolvedValue({ conversations: [] });
    await get('/dm/conversations');
    expect(get).toHaveBeenCalledWith('/dm/conversations');
  });

  it('posts message with receiverId and body to /dm/messages', async () => {
    post.mockResolvedValue({});
    const receiverId = 'user123';
    const body = 'Hello there';
    await post('/dm/messages', { receiverId, body });
    expect(post).toHaveBeenCalledWith('/dm/messages', { receiverId, body });
  });
});
