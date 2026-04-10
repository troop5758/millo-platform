/**
 * Millo Mobile — root application component.
 * Wires push notifications and navigation.
 * https://milloapp.com
 */
import './sentry';
import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { BiometricGate } from './components/BiometricGate';
import ErrorBoundary from './components/ErrorBoundary';
import {
  registerForPushNotifications,
  addNotificationListener,
  addNotificationResponseListener,
} from './services/pushNotifications';
import { startOfflineDmSync } from './services/offlineDmSync';
import './i18n';
import { loadPersistedLanguage } from './i18n';

function AppWithNotifications() {
  const { user }         = useAuth();
  const navigationRef    = useRef(null);
  const notifListenerRef    = useRef(null);
  const responseListenerRef = useRef(null);

  // Deep-link handler: navigate to the right screen based on notification data
  const handleNotificationData = (data) => {
    if (!data || !navigationRef.current) return;
    try {
      const nav = navigationRef.current;
      switch (data.type) {
        case 'dm':
        case 'new_message':
          nav.navigate('Tabs', { screen: 'Messages' });
          break;
        case 'new_follow':
        case 'follow':
          // Navigate to the follower's profile if we have their ID
          if (data.followerId) {
            nav.navigate('CreatorProfile', { creatorId: data.followerId });
          } else {
            nav.navigate('Tabs', { screen: 'Notifications' });
          }
          break;
        case 'new_gift':
        case 'gift':
          nav.navigate('Tabs', { screen: 'Notifications' });
          break;
        case 'bid':
          nav.navigate('Tabs', { screen: 'Shop' });
          break;
        case 'live':
        case 'stream_started':
          nav.navigate('Tabs', { screen: 'Live' });
          break;
        case 'subscription':
        case 'subscriptionActivated':
        case 'subscriptionRenewed':
          nav.navigate('Tabs', { screen: 'Profile' });
          break;
        case 'creator_approved':
          nav.navigate('Tabs', { screen: 'Live' });
          break;
        default:
          nav.navigate('Tabs', { screen: 'Notifications' });
      }
    } catch { /* navigation not ready */ }
  };

  useEffect(() => {
    loadPersistedLanguage();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Start offline DM sync monitor
    const stopSync = startOfflineDmSync();

    // Register push token when user is logged in
    registerForPushNotifications().catch(() => {});

    // Handle foreground notifications (show in-app banner / log)
    notifListenerRef.current = addNotificationListener((notification) => {
      // Foreground notification — OS won't show a banner, handle in-app toast here if needed
    });

    // Handle notification taps (user tapped a system notification)
    responseListenerRef.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data || {};
      handleNotificationData(data);
    });

    return () => {
      stopSync();
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [user?._id]);

  return <AppNavigator navigationRef={navigationRef} />;
}

export default function App() {
  useEffect(() => { loadPersistedLanguage(); }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <BiometricGate>
              <AppWithNotifications />
            </BiometricGate>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
