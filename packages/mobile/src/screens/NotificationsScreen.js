/**
 * NotificationsScreen — real-time notifications list.
 * Fetches from GET /content/notifications, listens for push via WebSocket.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, useColorScheme, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { dark, light } from '../theme/colors';
import Constants from 'expo-constants';

const WS_URL = Constants.expoConfig?.extra?.wsUrl || 'ws://localhost:3000';
const TOKEN_KEY = 'millo_token';

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TYPE_ICONS = {
  newFollower:     '👥',
  newGift:         '🎁',
  newSubscriber:   '⭐',
  newMessage:      '💬',
  streamStarted:   '📡',
  creatorApproved: '✅',
  creatorRejected: '❌',
  default:         '🔔',
};

export default function NotificationsScreen() {
  const scheme  = useColorScheme();
  const C       = scheme === 'dark' ? dark : light;
  const { t }   = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]        = useState(true);
  const [refresh,       setRefresh]        = useState(false);
  const [unread,        setUnread]         = useState(0);
  const wsRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await get('/content/notifications?limit=50');
      const list = data.notifications || [];
      setNotifications(list);
      setUnread(list.filter((n) => !n.read).length);
    } catch { /* silent */ }
    setLoading(false);
    setRefresh(false);
  }, []);

  useEffect(() => {
    load();
    // Connect WebSocket for real-time push
    let token = '';
    try { token = require('expo-secure-store').getItemAsync('millo_token') || ''; } catch { /* ignore */ }
    // Using async pattern
    (async () => {
      const { getToken } = require('../api/client');
      const t = await getToken();
      if (!t) return;
      const ws = new WebSocket(`${WS_URL}/user/ws?token=${t}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'notification') {
            setNotifications((prev) => [msg.data, ...prev]);
            setUnread((u) => u + 1);
          }
        } catch { /* ignore */ }
      };
    })();
    return () => { wsRef.current?.close(); };
  }, []);

  const markAllRead = async () => {
    try {
      await post('/content/notifications/read', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  const s = styles(C);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('notifications.title')}</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead} activeOpacity={0.7}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item._id || item.id || Math.random())}
          contentContainerStyle={notifications.length === 0 ? s.emptyContainer : undefined}
          refreshControl={
            <RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.accent} />
          }
          renderItem={({ item }) => {
            const icon = TYPE_ICONS[item.type] || TYPE_ICONS.default;
            return (
              <TouchableOpacity
                style={[s.item, !item.read && s.unread]}
                activeOpacity={0.75}>
                <View style={[s.iconBox, !item.read && { backgroundColor: C.accent + '22' }]}>
                  <Text style={{ fontSize: 18 }}>{icon}</Text>
                </View>
                <View style={s.content}>
                  <Text style={s.title} numberOfLines={1}>{item.title || t('notifications.defaultTitle')}</Text>
                  {item.body ? <Text style={s.body} numberOfLines={2}>{item.body}</Text> : null}
                  <Text style={s.time}>{timeAgo(item.createdAt)}</Text>
                </View>
                {!item.read && <View style={s.dot} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
              <Text style={s.emptyTitle}>{t('notifications.empty')}</Text>
              <Text style={s.emptySub}>{t('notifications.empty')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: C.text },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  unread:         { backgroundColor: C.accent + '08' },
  iconBox:        { width: 42, height: 42, borderRadius: 12, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', shrink: 0 },
  content:        { flex: 1 },
  title:          { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  body:           { fontSize: 13, color: C.textMuted, lineHeight: 18 },
  time:           { fontSize: 11, color: C.textMuted, marginTop: 4 },
  dot:            { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginTop: 4 },
  emptyContainer: { flex: 1 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle:     { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub:       { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});
