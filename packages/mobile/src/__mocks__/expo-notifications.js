'use strict';
module.exports = {
  requestPermissionsAsync:        jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync:          jest.fn().mockResolvedValue({ data: 'ExpoToken[test]' }),
  setNotificationHandler:         jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync:      jest.fn().mockResolvedValue('notif-id'),
  AndroidNotificationPriority: { HIGH: 'high', DEFAULT: 'default' },
};
