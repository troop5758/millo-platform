/**
 * BlockedUsersScreen — list and unblock users.
 * Uses GET /profile/blocked, POST /profile/unblock
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { dark, light } from '../theme/colors';

export default function BlockedUsersScreen({ navigation }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { t } = useTranslation();
  const s = styles(C);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unblocking, setUnblocking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get('/profile/blocked');
      setList(data.blocked || []);
    } catch (e) {
      setError(e?.message || t('common.error'));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = (user) => {
    const name = user.displayName || user.email?.split('@')[0] || user.userId || 'User';
    Alert.alert(
      t('blocked.unblockTitle', 'Unblock'),
      t('blocked.unblockConfirm', { name: `"${name}"` }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('blocked.unblock', 'Unblock'),
          style: 'destructive',
          onPress: async () => {
            const uid = String(user.userId);
            setUnblocking(uid);
            try {
              await post('/profile/unblock', { targetUserId: uid });
              setList((prev) => prev.filter((u) => String(u.userId) !== uid));
            } catch (e) {
              setError(e?.message || t('common.error'));
            } finally {
              setUnblocking(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('blocked.title', 'Blocked Users')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <View style={s.errBanner}>
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Text style={s.bannerX}>✕</Text></TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 60 }} />
      ) : list.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>{t('blocked.empty', 'No blocked users')}</Text>
          <Text style={s.emptySub}>{t('blocked.emptyDesc', 'Users you block will appear here.')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {list.map((u) => (
            <View key={String(u.userId)} style={s.row}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>
                  {(u.displayName || u.email || 'U')[0].toUpperCase()}
                </Text>
              </View>
              <View style={s.info}>
                <Text style={s.name}>{u.displayName || u.email?.split('@')[0] || u.userId}</Text>
                {u.username && <Text style={s.handle}>@{u.username}</Text>}
              </View>
              <TouchableOpacity
                style={[s.unblockBtn, unblocking === String(u.userId) && { opacity: 0.5 }]}
                onPress={() => handleUnblock(u)}
                disabled={unblocking === String(u.userId)}
              >
                {unblocking === String(u.userId) ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={s.unblockText}>{t('blocked.unblock', 'Unblock')}</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back:      { width: 40, justifyContent: 'center' },
  backArrow: { fontSize: 28, color: C.text, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  errBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               backgroundColor: '#fee2e2', paddingHorizontal: 16, paddingVertical: 10 },
  errText:   { color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 },
  bannerX:   { color: C.textMuted, fontSize: 16, paddingLeft: 10 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: C.text },
  emptySub:  { fontSize: 13, color: C.textMuted, marginTop: 6, textAlign: 'center' },
  body:      { padding: 16, paddingBottom: 40 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
               borderBottomWidth: 1, borderBottomColor: C.border },
  avatar:    { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent,
               alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
  info:      { flex: 1 },
  name:      { fontSize: 15, fontWeight: '600', color: C.text },
  handle:    { fontSize: 12, color: C.textMuted, marginTop: 2 },
  unblockBtn:{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
               borderWidth: 1, borderColor: C.accent },
  unblockText: { fontSize: 13, fontWeight: '600', color: C.accent },
});
