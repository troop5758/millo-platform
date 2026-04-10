'use strict';
module.exports = {
  openBrowserAsync:          jest.fn().mockResolvedValue({ type: 'cancel' }),
  openAuthSessionAsync:      jest.fn().mockResolvedValue({ type: 'cancel' }),
  maybeCompleteAuthSession:  jest.fn().mockReturnValue({ type: 'success' }),
  dismissBrowser:            jest.fn(),
};
