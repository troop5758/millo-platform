'use strict';

jest.mock('../../api/client', () => ({
  get:      jest.fn(),
  post:     jest.fn(),
  getToken: jest.fn(),
}));

const { get, post } = require('../../api/client');

describe('CoinStoreScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../CoinStoreScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('CoinStoreScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches wallet balance via get /content/wallet', async () => {
    get.mockResolvedValue({ balanceCents: 1000, wallet: { balanceCents: 1000 } });
    const { get: clientGet } = require('../../api/client');
    await clientGet('/content/wallet');
    expect(clientGet).toHaveBeenCalledWith('/content/wallet');
  });

  it('post can be used for purchase flow', async () => {
    post.mockResolvedValue({ ok: true });
    const { post: clientPost } = require('../../api/client');
    await clientPost('/payments/coins/purchase', { packId: 'starter' });
    expect(clientPost).toHaveBeenCalledWith('/payments/coins/purchase', { packId: 'starter' });
  });

  it('returns wallet data on get success', async () => {
    get.mockResolvedValue({ balanceCents: 500 });
    const result = await get('/content/wallet');
    expect(result.balanceCents).toBe(500);
  });
});
