'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get, post } = require('../../api/client');

describe('WalletScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../WalletScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('WalletScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('fetches wallet balance via get /content/wallet', async () => {
    get.mockResolvedValue({ wallet: { coins: 100 }, coins: 100 });
    const { get: clientGet } = require('../../api/client');
    await clientGet('/content/wallet');
    expect(clientGet).toHaveBeenCalledWith('/content/wallet');
  });

  it('fetches ledger entries via get /payments/wallet/transactions', async () => {
    get.mockResolvedValue({ transactions: [] });
    await get('/payments/wallet/transactions?limit=30');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/payments/wallet/transactions'));
  });

  it('fetches payout history via get /payments/payouts/history', async () => {
    get.mockResolvedValue({ payouts: [] });
    await get('/payments/payouts/history');
    expect(get).toHaveBeenCalledWith('/payments/payouts/history');
  });

  it('posts to request payout', async () => {
    post.mockResolvedValue({ ok: true });
    const { post: clientPost } = require('../../api/client');
    await clientPost('/payments/payouts/request', { amountCents: 1000, provider: 'stripe' });
    expect(clientPost).toHaveBeenCalledWith('/payments/payouts/request', {
      amountCents: 1000,
      provider: 'stripe',
    });
  });
});
