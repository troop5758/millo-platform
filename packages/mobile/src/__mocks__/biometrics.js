'use strict';
module.exports = {
  isBiometricAvailable: jest.fn().mockResolvedValue(false),
  isBiometricEnabled:   jest.fn().mockResolvedValue(false),
  setBiometricEnabled:  jest.fn().mockResolvedValue(undefined),
  authenticate:         jest.fn().mockResolvedValue(true),
  getBiometricTypes:    jest.fn().mockResolvedValue([]),
};
