'use strict';
module.exports = {
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  hasHardwareAsync:          jest.fn().mockResolvedValue(false),
  isEnrolledAsync:           jest.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  authenticateAsync:         jest.fn().mockResolvedValue({ success: false }),
};
