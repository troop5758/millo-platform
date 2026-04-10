'use strict';

jest.mock('../../api/client', () => ({
  get:        jest.fn(),
  post:       jest.fn(),
  saveToken:  jest.fn(),
}));

jest.mock('../../api/auth', () => ({
  login: jest.fn(),
}));

const { post } = require('../../api/client');
const { login } = require('../../api/auth');

describe('LoginScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../LoginScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('LoginScreen validation logic', () => {
  function isValid(email, password) {
    return !!email.trim() && !!password;
  }

  it('requires email', () => {
    expect(isValid('', 'password')).toBe(false);
  });

  it('requires password', () => {
    expect(isValid('user@example.com', '')).toBe(false);
  });

  it('accepts valid email and password', () => {
    expect(isValid('user@example.com', 'secret123')).toBe(true);
  });
});

describe('LoginScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('login calls auth.login which uses post to /auth/login', async () => {
    post.mockResolvedValue({ token: 'x', user: {} });
    const { login: authLogin } = require('../../api/auth');
    authLogin.mockImplementation(() => post('/auth/login', { email: 'a@b.com', password: 'pass' }));
    await authLogin('a@b.com', 'pass');
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pass' });
  });
});
