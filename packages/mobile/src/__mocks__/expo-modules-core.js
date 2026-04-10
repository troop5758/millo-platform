'use strict';
module.exports = {
  UnavailabilityError: class UnavailabilityError extends Error {},
  Platform: { OS: 'ios' },
  NativeModulesProxy: {},
  EventEmitter: class EventEmitter { addListener() {} removeAllListeners() {} },
};
