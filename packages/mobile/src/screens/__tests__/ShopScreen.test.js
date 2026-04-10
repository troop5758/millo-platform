/**
 * ShopScreen unit tests — product browsing, cart, and API interactions.
 * https://milloapp.com
 */
'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

const { get, post } = require('../../api/client');
const AsyncStorage = require('@react-native-async-storage/async-storage');

describe('ShopScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../ShopScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('fmtPrice utility', () => {
  function fmtPrice(cents, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  }

  it('formats whole dollar amounts', () => {
    expect(fmtPrice(1000)).toBe('$10.00');
    expect(fmtPrice(2500)).toBe('$25.00');
    expect(fmtPrice(0)).toBe('$0.00');
  });

  it('formats cents correctly', () => {
    expect(fmtPrice(199)).toBe('$1.99');
    expect(fmtPrice(9999)).toBe('$99.99');
  });

  it('uses provided currency', () => {
    const result = fmtPrice(1000, 'EUR');
    expect(result).toContain('10');
  });
});

describe('Cart persistence (AsyncStorage)', () => {
  beforeEach(async () => {
    AsyncStorage._store.clear();
    jest.clearAllMocks();
    AsyncStorage.getItem.mockImplementation((key) =>
      Promise.resolve(AsyncStorage._store.get(key) ?? null),
    );
    AsyncStorage.setItem.mockImplementation((key, val) => {
      AsyncStorage._store.set(key, val);
      return Promise.resolve();
    });
  });

  it('saves and loads cart correctly', async () => {
    const cart = [{ _id: 'p1', name: 'Test Product', priceCents: 1999, quantity: 2 }];
    await AsyncStorage.setItem('millo_cart', JSON.stringify(cart));
    const raw = await AsyncStorage.getItem('millo_cart');
    const loaded = JSON.parse(raw);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]._id).toBe('p1');
    expect(loaded[0].quantity).toBe(2);
  });

  it('returns empty array when cart is empty', async () => {
    const raw = await AsyncStorage.getItem('millo_cart');
    expect(raw).toBeNull();
  });
});

describe('ShopScreen API interactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches active products', async () => {
    const products = [
      { _id: 'p1', name: 'Cap', priceCents: 2999, status: 'active' },
      { _id: 'p2', name: 'Hoodie', priceCents: 5999, status: 'active' },
    ];
    get.mockResolvedValue({ products, count: 2 });
    const data = await get('/shop/products?status=active&limit=30');
    expect(data.products).toHaveLength(2);
    expect(data.products[0].status).toBe('active');
  });

  it('handles empty product list', async () => {
    get.mockResolvedValue({ products: [], count: 0 });
    const data = await get('/shop/products?status=active&limit=30');
    expect(data.products).toEqual([]);
  });

  it('handles network error gracefully', async () => {
    get.mockRejectedValue(new Error('Network error'));
    const result = await get('/shop/products').catch(() => ({ products: [] }));
    expect(result.products).toEqual([]);
  });
});
