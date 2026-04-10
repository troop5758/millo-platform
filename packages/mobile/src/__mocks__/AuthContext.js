'use strict';
const mockUser = { _id: 'user1', email: 'test@millo.com', role: 'creator', displayName: 'Test User' };
module.exports = {
  useAuth: () => ({
    user:   mockUser,
    token:  'mock_token',
    logout: jest.fn(),
    login:  jest.fn(),
  }),
  AuthProvider: ({ children }) => children,
};
