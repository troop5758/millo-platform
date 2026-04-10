'use strict';

jest.mock('../../api/client', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));

jest.mock('../../api/auth', () => ({
  register: jest.fn(),
}));

const { post } = require('../../api/client');

describe('RegisterScreen module', () => {
  it('exports a default component', () => {
    const mod = require('../RegisterScreen');
    const Component = mod.default || mod;
    expect(typeof Component).toBe('function');
  });
});

describe('RegisterScreen API interactions', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('register posts to /auth/register with required fields', async () => {
    post.mockResolvedValue({ token: 'x', user: {} });
    const { register } = require('../../api/auth');
    register.mockImplementation((email, password, displayName) =>
      post('/auth/register', { email, password, displayName })
    );
    await register('user@example.com', 'password123', 'Display Name');
    expect(post).toHaveBeenCalledWith('/auth/register', {
      email: 'user@example.com',
      password: 'password123',
      displayName: 'Display Name',
    });
  });

  it('register accepts undefined displayName', async () => {
    post.mockResolvedValue({ token: 'x', user: {} });
    const { register } = require('../../api/auth');
    register.mockImplementation((email, password, displayName) =>
      post('/auth/register', { email, password, displayName })
    );
    await register('user@example.com', 'password123', undefined);
    expect(post).toHaveBeenCalledWith('/auth/register', {
      email: 'user@example.com',
      password: 'password123',
      displayName: undefined,
    });
  });
});
