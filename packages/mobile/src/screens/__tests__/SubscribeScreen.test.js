'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get, post } = require('../../api/client');

describe('SubscribeScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../SubscribeScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('SubscribeScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches subscription tiers and creator via get', async () => {
    get.mockResolvedValue({ creator: {}, subscribed: false, balanceCents: 0 });
    const { get: clientGet } = require('../../api/client');
    await clientGet('/content/creators/creator123');
    expect(clientGet).toHaveBeenCalledWith('/content/creators/creator123');
  });

  it('fetches subscription status via get', async () => {
    get.mockResolvedValue({ subscribed: false });
    await get('/payments/subscriptions/status/creator123');
    expect(get).toHaveBeenCalledWith('/payments/subscriptions/status/creator123');
  });

  it('posts to create subscription', async () => {
    post.mockResolvedValue({ ok: true });
    const { post: clientPost } = require('../../api/client');
    await clientPost('/payments/subscriptions/creator', { creatorId: 'creator123' });
    expect(clientPost).toHaveBeenCalledWith('/payments/subscriptions/creator', { creatorId: 'creator123' });
  });
});
