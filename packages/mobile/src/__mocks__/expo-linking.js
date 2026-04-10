'use strict';
module.exports = {
  createURL:     (path) => `millo://${path}`,
  openURL:       jest.fn().mockResolvedValue(undefined),
  canOpenURL:    jest.fn().mockResolvedValue(true),
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};
