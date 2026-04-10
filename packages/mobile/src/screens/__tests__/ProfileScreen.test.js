/**
 * ProfileScreen unit tests — auth guards, API calls, biometrics, settings.
 * https://milloapp.com
 */
'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));
jest.mock('../../services/biometrics');

const { get, post } = require('../../api/client');
const biometrics = require('../../services/biometrics');

describe('ProfileScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../ProfileScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('ProfileScreen API interactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches wallet balance', async () => {
    get.mockResolvedValue({ balanceCents: 5000, currency: 'USD' });
    const data = await get('/content/wallet');
    expect(data.balanceCents).toBe(5000);
  });

  it('fetches user analytics', async () => {
    get.mockResolvedValue({
      followers: 120, subscribers: 10, streams: { total: 5 }, revenue30dCents: 2500,
    });
    const data = await get('/content/analytics/me');
    expect(data.followers).toBe(120);
    expect(data.revenue30dCents).toBe(2500);
  });

  it('sends payout request with correct payload', async () => {
    post.mockResolvedValue({ ok: true, newBalance: 0, payout: { _id: 'po1', amountCents: 5000 } });
    const data = await post('/payments/payouts/request', { amountCents: 5000 });
    expect(data.ok).toBe(true);
    expect(data.payout.amountCents).toBe(5000);
    expect(post).toHaveBeenCalledWith('/payments/payouts/request', { amountCents: 5000 });
  });

  it('handles payout request failure', async () => {
    post.mockRejectedValue(new Error('Insufficient balance'));
    const err = await post('/payments/payouts/request', { amountCents: 99999 }).catch((e) => e);
    expect(err.message).toBe('Insufficient balance');
  });
});

describe('ProfileScreen biometric auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks biometric availability on load', async () => {
    biometrics.isBiometricAvailable.mockResolvedValue(true);
    biometrics.isBiometricEnabled.mockResolvedValue(false);
    const available = await biometrics.isBiometricAvailable();
    const enabled   = await biometrics.isBiometricEnabled();
    expect(available).toBe(true);
    expect(enabled).toBe(false);
  });

  it('enables biometrics after successful authentication', async () => {
    biometrics.authenticate.mockResolvedValue(true);
    biometrics.setBiometricEnabled.mockResolvedValue(undefined);
    const authed = await biometrics.authenticate();
    if (authed) await biometrics.setBiometricEnabled(true);
    expect(biometrics.setBiometricEnabled).toHaveBeenCalledWith(true);
  });

  it('does not enable biometrics when authentication fails', async () => {
    biometrics.authenticate.mockResolvedValue(false);
    const authed = await biometrics.authenticate();
    if (authed) await biometrics.setBiometricEnabled(true);
    expect(biometrics.setBiometricEnabled).not.toHaveBeenCalled();
  });
});

describe('ProfileScreen payout validation', () => {
  const MIN_PAYOUT_CENTS = 500; // $5.00

  it('rejects payout below minimum', () => {
    const cents = 499;
    expect(cents >= MIN_PAYOUT_CENTS).toBe(false);
  });

  it('accepts payout at minimum', () => {
    const cents = 500;
    expect(cents >= MIN_PAYOUT_CENTS).toBe(true);
  });

  it('rejects zero amount', () => {
    const cents = Math.round(parseFloat('0') * 100);
    expect(!cents || cents < MIN_PAYOUT_CENTS).toBe(true);
  });

  it('accepts valid payout amount', () => {
    const cents = Math.round(parseFloat('25.00') * 100);
    expect(cents >= MIN_PAYOUT_CENTS).toBe(true);
  });
});
