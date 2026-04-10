/**
 * Sentry initialization for Millo mobile. Set EXPO_PUBLIC_SENTRY_DSN or extra.sentryDsn.
 * https://milloapp.com
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? Constants.expoConfig?.extra?.sentryDsn;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
  });
}
