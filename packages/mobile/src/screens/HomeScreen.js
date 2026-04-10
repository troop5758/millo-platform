/**
 * HomeScreen — live streams feed + for-you content.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, useColorScheme, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get } from '../api/client';
import { dark, light } from '../theme/colors';

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function StreamCard({ item, C, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={[card(C).wrap]} onPress={onPress}>
      <View style={card(C).thumb}>
        <Text style={{ fontSize: 28 }}>📺</Text>
        {item.status === 'live' && (
          <View style={card(C).liveBadge}><Text style={card(C).liveText}>LIVE</Text></View>
        )}
        {item.viewers != null && (
          <View style={card(C).viewerBadge}>
            <Text style={card(C).viewerText}>👁 {fmtNum(item.viewers)}</Text>
          </View>
        )}
      </View>
      <View style={card(C).info}>
        <Text style={card(C).title} numberOfLines={2}>{item.title || 'Live Stream'}</Text>
        <Text style={card(C).creator} numberOfLines={1}>{item.displayName || item.username || 'Creator'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const card = (C) => StyleSheet.create({
  wrap:        { marginBottom: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  thumb:       { height: 200, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  liveBadge:   { position: 'absolute', top: 10, left: 10, backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  liveText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  viewerBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  viewerText:  { color: '#fff', fontSize: 11 },
  info:        { padding: 12 },
  title:       { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  creator:     { fontSize: 13, color: C.textMuted },
});

export default function HomeScreen({ navigation }) {
  const scheme     = useColorScheme();
  const C          = scheme === 'dark' ? dark : light;
  const { t }      = useTranslation();
  const [streams,  setStreams]  = useState([]);
  const [loading,  setLoading] = useState(true);
  const [refresh,  setRefresh] = useState(false);
  const [error,    setError]   = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const data = await get('/content/feed?tab=foryou&limit=20');
      setStreams(data.items || data.streams || []);
    } catch {
      setError(true);
    }
    setLoading(false);
    setRefresh(false);
  };

  useEffect(() => { load(); }, []);

  const handlePress = (item) => {
    const creatorId = String(item.creatorId || item.userId || '');
    if (creatorId) {
      navigation.navigate('CreatorProfile', { creatorId });
    } else {
      navigation.navigate('Tabs', { screen: 'Live' });
    }
  };

  const s = styles(C);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('home.title')}</Text>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📡</Text>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
            {t('home.errorTitle')}
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32 }}>
            {t('home.errorDesc')}
          </Text>
          <TouchableOpacity
            onPress={() => load()}
            style={{ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={streams}
          keyExtractor={(i) => String(i._id || i.id)}
          renderItem={({ item }) => <StreamCard item={item} C={C} onPress={() => handlePress(item)} />}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.accent} />}
          ListEmptyComponent={<Text style={s.empty}>{t('home.noStreams')}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  list:        { padding: 16 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:       { textAlign: 'center', color: C.textMuted, marginTop: 60, fontSize: 15 },
});
