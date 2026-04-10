/**
 * LiveScreen — live stream grid with real HLS video playback via react-native-video.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, useColorScheme, ActivityIndicator,
  Modal, StatusBar, Dimensions, Platform,
} from 'react-native';
import Video from 'react-native-video';
import { useTranslation } from 'react-i18next';
import { get } from '../api/client';
import { dark, light } from '../theme/colors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function fmtViewers(n) {
  if (!n) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

/* ── Full-screen HLS player modal ── */
function StreamPlayer({ stream, onClose, C }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [paused,     setPaused]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [volume,     setVolume]     = useState(1);
  const [showControls, setControls] = useState(true);
  const controlsTimer = useRef(null);

  const hlsUrl = stream?.streamUrl || stream?.playbackUrl || stream?.hlsUrl || stream?.meta?.playbackUrl;

  // Auto-hide controls after 3 s
  const resetControlsTimer = useCallback(() => {
    setControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, []);

  const s = playerStyles(C);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={s.root}>
        {hlsUrl ? (
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={resetControlsTimer}>
            <Video
              ref={videoRef}
              source={{ uri: hlsUrl, type: 'm3u8' }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              paused={paused}
              volume={volume}
              repeat={false}
              onLoadStart={() => { setLoading(true); setError(null); }}
              onLoad={() => setLoading(false)}
              onError={(e) => { setLoading(false); setError(e?.error?.localizedDescription || 'Failed to load stream'); }}
              onBuffer={({ isBuffering }) => setLoading(isBuffering)}
              onEnd={onClose}
              ignoreSilentSwitch="ignore"
              playInBackground={false}
              pictureInPicture={Platform.OS === 'ios'}
            />

            {/* Buffering spinner */}
            {loading && (
              <View style={s.loadOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={s.loadOverlay}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 12 }}>
                  {t('live.couldNotLoad')}
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>{error}</Text>
              </View>
            )}

            {/* Controls overlay */}
            {showControls && (
              <View style={s.controls}>
                {/* Top bar */}
                <View style={s.topBar}>
                  <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.8}>
                    <Text style={{ color: '#fff', fontSize: 22 }}>✕</Text>
                  </TouchableOpacity>
                  <View style={s.streamInfo}>
                    <View style={s.liveBadge}><Text style={s.liveBadgeText}>{t('live.liveBadge')}</Text></View>
                    <Text style={s.streamTitle} numberOfLines={1}>{stream.title || t('live.liveStreamFallback')}</Text>
                  </View>
                  {(stream.viewerCount ?? stream.viewers) > 0 && (
                    <View style={s.viewerBadge}>
                      <Text style={{ color: '#fff', fontSize: 10 }}>👁 {fmtViewers(stream.viewerCount ?? stream.viewers)}</Text>
                    </View>
                  )}
                </View>

                {/* Center play/pause */}
                <TouchableOpacity style={s.playPause} onPress={() => setPaused((p) => !p)} activeOpacity={0.8}>
                  <Text style={{ color: '#fff', fontSize: 32 }}>{paused ? '▶' : '⏸'}</Text>
                </TouchableOpacity>

                {/* Bottom bar */}
                <View style={s.bottomBar}>
                  <Text style={s.creatorName}>{stream.displayName || stream.creator?.displayName || t('live.creatorFallback')}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          // No HLS URL available
          <View style={s.noStream}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
              {stream.title || t('live.liveStreamFallback')}
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              {t('live.streamNotAvail')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('live.goBack')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const playerStyles = (C) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#000' },
  loadOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  controls:    { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar:      { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 48, gap: 8 },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  streamInfo:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBadge:   { backgroundColor: C.accentLive, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  liveBadgeText:{ color: '#fff', fontSize: 9, fontWeight: '900' },
  streamTitle: { color: '#fff', fontWeight: '600', fontSize: 13, flex: 1 },
  viewerBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  playPause:   { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottomBar:   { padding: 16, paddingBottom: 32 },
  creatorName: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  noStream:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

/* ── Main screen ── */
export default function LiveScreen() {
  const scheme    = useColorScheme();
  const C         = scheme === 'dark' ? dark : light;
  const { t }     = useTranslation();
  const [streams, setStreams]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [error,   setError]   = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const data = await get('/content/streams?status=live&limit=30');
      setStreams(data.streams || []);
    } catch {
      setError(true);
    }
    setLoading(false);
    setRefresh(false);
  };

  useEffect(() => { load(); }, []);

  const s = styles(C);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <View style={s.liveDot} />
        <Text style={s.headerTitle}>{t('live.title')}</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📡</Text>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
            {t('live.errorTitle')}
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32 }}>
            {t('live.errorDesc')}
          </Text>
          <TouchableOpacity
            onPress={() => load()}
            style={{ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('live.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={streams}
          numColumns={2}
          keyExtractor={(i) => String(i._id || i.id)}
          contentContainerStyle={s.list}
          columnWrapperStyle={s.row}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(true); }} tintColor={C.accent} />}
          renderItem={({ item }) => {
            const vc = fmtViewers(item.viewerCount ?? item.viewers);
            return (
              <TouchableOpacity style={s.card} onPress={() => setPlaying(item)} activeOpacity={0.85}>
                <View style={s.thumb}>
                  <Text style={{ fontSize: 22 }}>📺</Text>
                  <View style={s.livePill}><Text style={s.livePillText}>{t('live.liveBadge')}</Text></View>
                  {vc && (
                    <View style={s.viewerPill}>
                      <Text style={s.viewerPillText}>👁 {vc}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.title} numberOfLines={2}>{item.title || t('live.liveStreamFallback')}</Text>
                <Text style={s.sub}>{item.displayName || item.creatorName || t('live.creatorFallback')}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={s.empty}>{t('live.noStreams')}</Text>
          }
        />
      )}

      {playing && (
        <StreamPlayer stream={playing} onClose={() => setPlaying(null)} C={C} />
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  liveDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accentLive },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: C.text },
  list:         { padding: 12 },
  row:          { gap: 12, marginBottom: 12 },
  card:         { flex: 1, backgroundColor: C.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  thumb:        { height: 110, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  livePill:     { position: 'absolute', top: 6, left: 6, backgroundColor: C.accentLive, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  livePillText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  viewerPill:   { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  viewerPillText:{ color: '#fff', fontSize: 9 },
  title:        { fontSize: 13, fontWeight: '600', color: C.text, padding: 8, paddingBottom: 2 },
  sub:          { fontSize: 11, color: C.textMuted, paddingHorizontal: 8, paddingBottom: 8 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:        { textAlign: 'center', color: C.textMuted, marginTop: 60, padding: 20, fontSize: 14 },
});
