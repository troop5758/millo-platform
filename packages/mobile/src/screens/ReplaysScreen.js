/**
 * ReplaysScreen — browse and watch recorded stream replays (VOD library).
 * GET /content/vod
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator,
  useColorScheme, RefreshControl, Modal, Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { dark, light } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const { width: SCREEN_W } = Dimensions.get('window');

function authFetch(path, token) {
  return fetch(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  });
}

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60000)  return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 2592000000) return `${Math.floor(ms / 86400000)}d ago`;
  return `${Math.floor(ms / 2592000000)}mo ago`;
}

function fmtDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VODCard({ vod, onPress, C }) {
  const { t } = useTranslation();
  const s = cardStyles(C);
  const creator = vod.creator?.displayName || vod.creator?.username || t('replays.creatorFallback');
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(vod)} activeOpacity={0.85}>
      <View style={s.thumb}>
        {vod.thumbnailUrl
          ? <Image source={{ uri: vod.thumbnailUrl }} style={s.thumbImg} resizeMode="cover" />
          : <View style={s.thumbPlaceholder}><Text style={{ fontSize: 28 }}>📹</Text></View>}
        {vod.recordingDuration > 0 && (
          <View style={s.durationBadge}>
            <Text style={s.durationText}>{fmtDuration(vod.recordingDuration)}</Text>
          </View>
        )}
      </View>
      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>{vod.title || t('replays.untitled')}</Text>
        <View style={s.meta}>
          <Text style={s.creator}>{creator}</Text>
          <Text style={s.dot}>·</Text>
          <Text style={s.ago}>{timeAgo(vod.endedAt || vod.createdAt)}</Text>
        </View>
        {vod.viewerCount > 0 && (
          <Text style={s.views}>{t('replays.viewers', { count: vod.viewerCount.toLocaleString() })}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = (C) => StyleSheet.create({
  card:         { marginBottom: 16, backgroundColor: C.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  thumb:        { aspectRatio: 16 / 9, backgroundColor: C.bgElevated, position: 'relative' },
  thumbImg:     { width: '100%', height: '100%' },
  thumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgElevated },
  durationBadge:{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  info:         { padding: 12 },
  title:        { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4, lineHeight: 20 },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creator:      { fontSize: 12, color: C.textMuted },
  dot:          { fontSize: 12, color: C.textMuted },
  ago:          { fontSize: 12, color: C.textMuted },
  views:        { fontSize: 11, color: C.textMuted, marginTop: 2 },
});

export default function ReplaysScreen({ navigation }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { token } = useAuth();

  const [vods,       setVods]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [playing,    setPlaying]    = useState(null); // selected VOD for playback modal

  const LIMIT = 10;

  const load = useCallback(async (pg = 1, silent = false) => {
    if (!silent) { pg === 1 ? setLoading(true) : setLoadingMore(true); }
    try {
      const data = await authFetch(`/content/vod?page=${pg}&limit=${LIMIT}`, token);
      const incoming = data.vods || [];
      if (pg === 1) setVods(incoming);
      else setVods((prev) => [...prev, ...incoming]);
      setHasMore(incoming.length === LIMIT);
      setPage(pg);
    } catch { /* silently fail */ }
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  const loadMore = () => {
    if (!loadingMore && hasMore) load(page + 1);
  };

  const s = mainStyles(C);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.canGoBack() && navigation.goBack()} style={s.backBtn}>
          <Text style={{ color: C.accent, fontSize: 16 }}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('replays.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={vods}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <VODCard vod={item} onPress={setPlaying} C={C} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, true); }} tintColor={C.accent} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} /> : null
          }
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎬</Text>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{t('replays.noReplays')}</Text>
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center' }}>
                {t('replays.noReplaysDesc')}
              </Text>
            </View>
          }
        />
      )}

      {/* Playback modal */}
      <Modal visible={!!playing} animationType="slide" statusBarTranslucent>
        {playing && (
          <VODPlayerModal vod={playing} onClose={() => setPlaying(null)} C={C} />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function VODPlayerModal({ vod, onClose, C }) {
  const { t } = useTranslation();
  // Dynamic import to avoid hard crash when react-native-video not installed
  let VideoComponent = null;
  try {
    const { default: Video } = require('react-native-video');
    VideoComponent = Video;
  } catch { /* unavailable */ }

  const s = playerStyles(C);
  const creator = vod.creator?.displayName || vod.creator?.username || t('replays.creatorFallback');

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{vod.title || t('replays.untitled')}</Text>
        </View>

        {/* Player */}
        <View style={s.playerWrap}>
          {VideoComponent && vod.recordingUrl ? (
            <VideoComponent
              source={{ uri: vod.recordingUrl }}
              style={s.player}
              controls
              resizeMode="contain"
              onError={() => {}}
            />
          ) : (
            <View style={[s.player, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🎬</Text>
              <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>
                {vod.recordingUrl ? t('replays.videoUnavail') : t('replays.recordingNotReady')}
              </Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={s.info}>
          <Text style={s.title}>{vod.title || t('replays.untitled')}</Text>
          <Text style={s.creator}>{creator}</Text>
          <View style={s.metaRow}>
            {vod.viewerCount > 0 && (
              <Text style={s.meta}>{t('replays.viewers', { count: vod.viewerCount.toLocaleString() })}</Text>
            )}
            {vod.recordingDuration > 0 && (
              <Text style={s.meta}>{fmtDuration(vod.recordingDuration)}</Text>
            )}
            {(vod.endedAt || vod.createdAt) && (
              <Text style={s.meta}>{timeAgo(vod.endedAt || vod.createdAt)}</Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const mainStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:{ fontSize: 16, fontWeight: '700', color: C.text },
  backBtn:   { width: 60 },
});

const playerStyles = (C) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  closeBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  playerWrap:  { aspectRatio: 16 / 9, backgroundColor: '#000', width: '100%' },
  player:      { width: '100%', height: '100%' },
  info:        { padding: 20, backgroundColor: C.bgCard },
  title:       { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  creator:     { fontSize: 13, color: C.textMuted, marginBottom: 8 },
  metaRow:     { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta:        { fontSize: 12, color: C.textMuted },
});
