/**
 * Tests for packages/mobile/src/api/auth.js
 * Mocks globalThis.fetch and expo-secure-store.
 */
const SecureStore = require('../../__mocks__/expo-secure-store');
const { login, register, logout, fetchMe } = require('../auth');

beforeEach(() => {
  SecureStore._reset();
  jest.clearAllMocks();
  globalThis.fetch = jest.fn();
});

function mockFetch(body, ok = true, status = 200) {
  fetch.mockResolvedValue({ ok, status, json: async () => body });
}

describe('login()', () => {
  test('calls POST /auth/login and saves token', async () => {
    mockFetch({ token: 'tok_login', user: { id: '1' } });
    const result = await login('user@test.com', 'password');
    expect(result.token).toBe('tok_login');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('millo_token', 'tok_login');
  });

  test('does not save token when response has none', async () => {
    mockFetch({ user: { id: '1' } });
    await login('user@test.com', 'password');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('throws on 401 Invalid credentials', async () => {
    mockFetch({ error: 'Invalid credentials' }, false, 401);
    await expect(login('bad@test.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });

  test('sends correct request body', async () => {
    mockFetch({ token: 'tok_ok' });
    await login('hello@test.com', 's3cret');
    const [, opts] = fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ email: 'hello@test.com', password: 's3cret' });
    expect(opts.method).toBe('POST');
  });

  test('calls the correct endpoint', async () => {
    mockFetch({ token: 'tok_ok' });
    await login('x@y.com', 'p');
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('/auth/login');
  });
});

describe('register()', () => {
  test('calls POST /auth/register with email, password, displayName', async () => {
    mockFetch({ token: 'tok_reg', user: { id: '2' } });
    const result = await register('new@test.com', 'pass123', 'Alice');
    expect(result.token).toBe('tok_reg');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/auth/register');
    expect(JSON.parse(opts.body)).toMatchObject({ email: 'new@test.com', displayName: 'Alice' });
  });

  test('saves token after successful registration', async () => {
    mockFetch({ token: 'tok_new' });
    await register('a@b.com', 'pass', 'Bob');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('millo_token', 'tok_new');
  });

  test('throws when email already exists', async () => {
    mockFetch({ error: 'Email already registered' }, false, 409);
    await expect(register('exists@test.com', 'x', 'X')).rejects.toThrow('Email already registered');
  });

  test('does not save token when registration fails', async () => {
    mockFetch({ error: 'Server error' }, false, 500);
    await expect(register('a@b.com', 'p', 'C')).rejects.toThrow();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('logout()', () => {
  test('calls POST /auth/logout and clears stored token', async () => {
    mockFetch({});
    await logout();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('millo_token');
  });

  test('clears token even when the logout request fails', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    await expect(logout()).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('millo_token');
  });
});

describe('fetchMe()', () => {
  test('returns the user object from /auth/me', async () => {
    mockFetch({ user: { id: '42', displayName: 'TestUser' } });
    const user = await fetchMe();
    expect(user).toEqual({ id: '42', displayName: 'TestUser' });
  });

  test('calls the correct endpoint', async () => {
    mockFetch({ user: { id: '1' } });
    await fetchMe();
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('/auth/me');
  });

  test('throws when not authenticated', async () => {
    mockFetch({ error: 'Unauthorized' }, false, 401);
    await expect(fetchMe()).rejects.toThrow('Unauthorized');
  });
});
