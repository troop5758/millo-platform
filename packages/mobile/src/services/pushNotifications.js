/**
 * pushNotifications.js — Expo push notification setup.
 * Call registerForPushNotifications() after the user logs in.
 * https://milloapp.com
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { post, del } from '../api/client';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
                 ?? Constants.expoConfig?.slug
                 ?? 'millo';
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:            'default',
      importance:      Notifications.AndroidImportance.MAX,
      vibrationPattern:[0, 250, 250, 250],
      lightColor:      '#7c3aed',
    });
  }

  // Send token to backend
  try {
    await post('/notifications/push-token', { token: expoPushToken, platform: 'expo' });
  } catch (e) {
    console.warn('[Push] Failed to register token with backend:', e.message);
  }

  return expoPushToken;
}

/** Call on logout to unregister the push token. */
export async function unregisterPushToken() {
  if (!Device.isDevice) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({}).catch(() => ({ data: null }));
    if (token) await del(`/notifications/push-token?token=${encodeURIComponent(token)}`).catch(() => {});
  } catch { /* ignore */ }
}

/** Add notification response listener (tap → navigate). */
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/** Add foreground notification listener. */
export function addNotificationListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}
