/**
 * Tests for packages/mobile/src/api/client.js
 * Mocks expo-secure-store and globalThis.fetch.
 */
const SecureStore = require('../../__mocks__/expo-secure-store');
const { getToken, saveToken, clearToken, get, post, del } = require('../client');

beforeEach(() => {
  SecureStore._reset();
  jest.clearAllMocks();
});

describe('getToken / saveToken / clearToken', () => {
  test('getToken returns empty string when no token stored', async () => {
    const token = await getToken();
    expect(token).toBe('');
  });

  test('saveToken stores token and getToken retrieves it', async () => {
    await saveToken('abc123');
    const token = await getToken();
    expect(token).toBe('abc123');
  });

  test('clearToken removes the stored token', async () => {
    await saveToken('abc123');
    await clearToken();
    const token = await getToken();
    expect(token).toBe('');
  });

  test('getToken returns empty string when SecureStore throws', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keychain error'));
    const token = await getToken();
    expect(token).toBe('');
  });
});

describe('get()', () => {
  test('resolves with parsed JSON on 200', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [1, 2, 3] }),
    });
    const result = await get('/content/feed');
    expect(result).toEqual({ items: [1, 2, 3] });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.milloapp.com/content/feed',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  test('includes Authorization header when token is present', async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce('tok_xyz');
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await get('/auth/me');
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tok_xyz');
  });

  test('omits Authorization header when no token stored', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await get('/public/endpoint');
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  test('throws with server error message on non-ok response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });
    await expect(get('/missing')).rejects.toThrow('Not found');
  });

  test('throws with fallback message when body has no error field', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(get('/fail')).rejects.toThrow('Request failed');
  });

  test('attaches status and data to thrown error', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden', reason: 'no_role' }),
    });
    const err = await get('/admin').catch(e => e);
    expect(err.status).toBe(403);
    expect(err.data).toEqual({ error: 'Forbidden', reason: 'no_role' });
  });
});

describe('post()', () => {
  test('sends POST with JSON body and returns parsed response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt_abc' }),
    });
    const result = await post('/auth/login', { email: 'a@b.com', password: 'pass' });
    expect(result).toEqual({ token: 'jwt_abc' });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.com', password: 'pass' });
  });

  test('throws on non-ok POST response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    await expect(post('/auth/login', {})).rejects.toThrow('Invalid credentials');
  });

  test('sends Content-Type: application/json header', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await post('/any', {});
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});

describe('del()', () => {
  test('sends DELETE request and returns parsed response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const result = await del('/follow/creator_1');
    expect(result).toEqual({ ok: true });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
  });

  test('throws on non-ok DELETE response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Resource not found' }),
    });
    await expect(del('/follow/creator_x')).rejects.toThrow('Resource not found');
  });
});
