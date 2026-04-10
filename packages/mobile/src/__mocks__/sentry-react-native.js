/**
 * Mock for @sentry/react-native in Jest tests.
 */
const init = jest.fn();
const captureException = jest.fn();
const captureMessage = jest.fn();
const withScope = jest.fn((cb) => cb && cb({ setTag: jest.fn(), setExtra: jest.fn() }));
module.exports = { init, captureException, captureMessage, withScope, default: { init, captureException, captureMessage, withScope } };
