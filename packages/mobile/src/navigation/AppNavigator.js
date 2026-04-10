/**
 * AppNavigator — root navigation for Millo mobile.
 * Auth stack (Login/Register) vs Main tab navigator.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme, View, Text, Platform } from 'react-native'; // Text still used in loading state
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { dark, light } from '../theme/colors';

// Screens
import LoginScreen           from '../screens/LoginScreen';
import RegisterScreen        from '../screens/RegisterScreen';
import HomeScreen            from '../screens/HomeScreen';
import LiveScreen            from '../screens/LiveScreen';
import ProfileScreen         from '../screens/ProfileScreen';
import MessagesScreen        from '../screens/MessagesScreen';
import SearchScreen          from '../screens/SearchScreen';
import ShopScreen            from '../screens/ShopScreen';
import NotificationsScreen   from '../screens/NotificationsScreen';
import CreatorProfileScreen  from '../screens/CreatorProfileScreen';
import ReplaysScreen         from '../screens/ReplaysScreen';
import SubscribeScreen       from '../screens/SubscribeScreen';
import CoinStoreScreen       from '../screens/CoinStoreScreen';
import WalletScreen          from '../screens/WalletScreen';
import SubscriptionsScreen   from '../screens/SubscriptionsScreen';
import BlockedUsersScreen    from '../screens/BlockedUsersScreen';
import PrivacySettingsScreen from '../screens/PrivacySettingsScreen';
import GoLiveScreen          from '../screens/GoLiveScreen';
import CallsScreen           from '../screens/CallsScreen';
import MoreMenuScreen        from '../screens/MoreMenuScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICONS = {
  Home:          { focused: 'home',              blur: 'home-outline' },
  Live:          { focused: 'radio',             blur: 'radio-outline' },
  Shop:          { focused: 'bag',               blur: 'bag-outline' },
  Search:        { focused: 'search',            blur: 'search-outline' },
  More:          { focused: 'apps',              blur: 'apps-outline' },
  Notifications: { focused: 'notifications',     blur: 'notifications-outline' },
  Messages:      { focused: 'chatbubbles',       blur: 'chatbubbles-outline' },
  Profile:       { focused: 'person-circle',     blur: 'person-circle-outline' },
};

/** Keeps Profile / Messages / Notifications off the tab bar; navigation.navigate name still works. */
function hiddenTabOptions() {
  return { tabBarButton: () => null };
}

function TabIcon({ name, focused, color, size }) {
  const set = TAB_ICONS[name];
  const icon = set ? (focused ? set.focused : set.blur) : 'ellipse-outline';
  return <Ionicons name={icon} size={size ?? 24} color={color} />;
}

const TAB_LABEL_KEYS = {
  Home: 'tabs.home',
  Live: 'tabs.live',
  Shop: 'tabs.shop',
  Search: 'tabs.search',
  More: 'tabs.more',
  Notifications: 'tabs.notifications',
  Messages: 'tabs.messages',
  Profile: 'tabs.profile',
};

function MainTabs() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C      = scheme === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const padBottom = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabel: t(TAB_LABEL_KEYS[route.name] || `tabs.${String(route.name).toLowerCase()}`),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -2,
        },
        tabBarStyle: {
          backgroundColor:   C.bgElevated,
          borderTopColor:    C.border,
          borderTopWidth:    1,
          height:            56 + padBottom,
          paddingBottom:     padBottom,
          paddingTop:        6,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 4,
            },
            android: { elevation: 10 },
          }),
        },
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused, color, size }) => (
          <TabIcon name={route.name} focused={focused} color={color} size={size ?? 22} />
        ),
      })}
    >
      <Tab.Screen name="Home"          component={HomeScreen} />
      <Tab.Screen name="Live"          component={LiveScreen} />
      <Tab.Screen name="Shop"          component={ShopScreen} />
      <Tab.Screen name="Search"        component={SearchScreen} />
      <Tab.Screen name="More"          component={MoreMenuScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={hiddenTabOptions()} />
      <Tab.Screen name="Messages"      component={MessagesScreen} options={hiddenTabOptions()} />
      <Tab.Screen name="Profile"       component={ProfileScreen} options={hiddenTabOptions()} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs"           component={MainTabs} />
      <Stack.Screen name="CreatorProfile" component={CreatorProfileScreen} />
      <Stack.Screen name="Replays"        component={ReplaysScreen} />
      <Stack.Screen name="Subscribe"      component={SubscribeScreen} />
      <Stack.Screen name="CoinStore"      component={CoinStoreScreen} />
      <Stack.Screen name="Wallet"         component={WalletScreen} />
      <Stack.Screen name="Subscriptions"  component={SubscriptionsScreen} />
      <Stack.Screen name="BlockedUsers"   component={BlockedUsersScreen} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen name="GoLive"         component={GoLiveScreen} />
      <Stack.Screen name="Calls"          component={CallsScreen} />
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator({ navigationRef }) {
  const { user, loading } = useAuth();
  const scheme = useColorScheme();
  const C      = scheme === 'dark' ? dark : light;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.textMuted }}>Loading…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        dark: scheme === 'dark',
        colors: {
          primary:    C.accent,
          background: C.bg,
          card:       C.bgCard,
          text:       C.text,
          border:     C.border,
          notification: C.accent,
        },
      }}
    >
      {user ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
