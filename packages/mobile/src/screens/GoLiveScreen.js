/**
 * GoLiveScreen — creator stream control. Start/stop live, stream key, OBS guide.
 * Uses POST /content/streams/start, POST /content/streams/:id/stop
 * https://milloapp.com
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, useColorScheme,
  Platform, Clipboard,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { post } from '../api/client';
import { dark, light } from '../theme/colors';

export default function GoLiveScreen({ navigation }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { t } = useTranslation();
  const { user } = useAuth();
  const s = styles(C);

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [priceCents, setPriceCents] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleStart = async () => {
    if (!title.trim()) { setError(t('goLive.errorTitle', 'Enter a stream title')); return; }
    if (title.trim().length > 120) { setError(t('goLive.errorTitleTooLong', { max: 120 })); return; }
    const price = Number(priceCents);
    if (visibility === 'paid' && (isNaN(price) || price < 99)) {
      setError(t('goLive.errorPriceTooLow', { min: '0.99' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await post('/content/streams/start', {
        title: title.trim(),
        visibility,
        priceCents: visibility === 'paid' ? price : 0,
      });
      const st = data.stream;
      setStream({
        ...st,
        streamKey: data.streamKey || st?.streamKey,
        ingestUrl: data.ingestUrl || st?.meta?.ingestUrl || `rtmp://ingest.milloapp.com/live`,
        playbackUrl: data.playbackUrl || st?.playbackUrl,
      });
    } catch (e) {
      const msg = e?.data?.error || e?.message;
      if (msg === 'CREATOR_NOT_APPROVED' || msg?.includes('CREATOR_NOT_APPROVED')) {
        setError(t('goLive.creatorRequired', 'Creator approval required'));
      } else {
        setError(msg || t('goLive.startFailed', 'Failed to start stream'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!stream?._id) { setStream(null); return; }
    setBusy(true);
    setError(null);
    try {
      await post(`/content/streams/${stream._id}/stop`, {});
      setStream(null);
      setTitle('');
      navigation.goBack();
    } catch (e) {
      setError(e?.message || t('goLive.stopFailed', 'Failed to stop stream'));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!stream?.streamKey) return;
    try {
      if (Platform.OS === 'web' && typeof navigator?.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(stream.streamKey);
      } else if (Clipboard?.setString) {
        Clipboard.setString(stream.streamKey);
      }
    } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('goLive.title', 'Go Live')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.center}>
          <Text style={s.needLogin}>{t('goLive.needLogin', 'Sign in to go live')}</Text>
          <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Login')}>
            <Text style={s.btnText}>{t('auth.login.signIn')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('goLive.title', 'Go Live')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <View style={s.errBanner}>
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Text style={s.bannerX}>✕</Text></TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.body}>
        {!stream ? (
          <>
            <View style={s.card}>
              <Text style={s.label}>{t('goLive.streamTitleLabel', 'Stream title')}</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('goLive.streamTitlePlaceholder', 'My stream')}
                placeholderTextColor={C.textMuted}
                maxLength={120}
              />
            </View>

            <View style={s.card}>
              <Text style={s.label}>{t('goLive.visibilityLabel', 'Visibility')}</Text>
              <View style={s.visibilityRow}>
                {['public', 'private', 'paid'].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[s.visibilityBtn, visibility === v && s.visibilityBtnActive]}
                    onPress={() => setVisibility(v)}
                  >
                    <Text style={[s.visibilityText, visibility === v && s.visibilityTextActive]}>
                      {v === 'public' ? t('goLive.public', 'Public') : v === 'private' ? t('goLive.private', 'Private') : t('goLive.ppv', 'PPV')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {visibility === 'paid' && (
              <View style={s.card}>
                <Text style={s.label}>{t('goLive.ppvPriceLabel', 'PPV price (cents)')}</Text>
                <TextInput
                  style={s.input}
                  value={priceCents}
                  onChangeText={setPriceCents}
                  placeholder="99"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                />
                <Text style={s.hint}>Min 99¢</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.startBtn, (busy || !title.trim()) && { opacity: 0.5 }]}
              onPress={handleStart}
              disabled={busy || !title.trim()}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.startBtnText}>{t('goLive.startStream', 'Start stream')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveBadgeText}>{t('goLive.liveBadge', 'LIVE')}</Text>
            </View>

            <View style={s.card}>
              <Text style={s.label}>{t('goLive.streamKeyLabel', 'Stream key')}</Text>
              <View style={s.keyRow}>
                <Text style={s.keyText} numberOfLines={1}>{stream.streamKey || '—'}</Text>
                <TouchableOpacity style={s.copyBtn} onPress={copyKey}>
                  <Text style={s.copyBtnText}>{copied ? t('goLive.copied', 'Copied') : t('goLive.copy', 'Copy')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>{t('goLive.obsCopy', 'Paste this into OBS or your streaming software')}</Text>
            </View>

            <View style={s.card}>
              <Text style={s.label}>{t('goLive.rtmpUrlLabel', 'RTMP URL')}</Text>
              <Text style={s.keyText}>{stream.ingestUrl || 'rtmp://ingest.milloapp.com/live'}</Text>
            </View>

            <View style={s.obsCard}>
              <Text style={s.obsTitle}>{t('goLive.obsSetup', 'OBS setup')}</Text>
              <Text style={s.obsStep}>1. {t('goLive.obsStep1', 'Add a Media Source or Game Capture')}</Text>
              <Text style={s.obsStep}>2. {t('goLive.obsStep2', 'Set Server')}: {stream.ingestUrl}</Text>
              <Text style={s.obsStep}>3. {t('goLive.obsStep3', 'Set Stream key to the value above')}</Text>
              <Text style={s.obsStep}>4. {t('goLive.obsStep4', 'Click Start Streaming')}</Text>
            </View>

            <TouchableOpacity style={[s.stopBtn, busy && { opacity: 0.5 }]} onPress={handleStop} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.stopBtnText}>{t('goLive.endStream', 'End stream')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  body:      { padding: 16, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  needLogin: { fontSize: 16, color: C.textMuted, marginBottom: 16 },
  card:      { backgroundColor: C.bgCard, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  label:     { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  input:     { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border,
               paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text },
  hint:      { fontSize: 11, color: C.textMuted, marginTop: 6 },
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visibilityBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  visibilityBtnActive: { borderColor: C.accent, backgroundColor: C.accent + '20' },
  visibilityText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  visibilityTextActive: { color: C.accent },
  startBtn:  { backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  liveDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveBadgeText: { color: '#ef4444', fontWeight: '800', fontSize: 14 },
  keyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyText:   { flex: 1, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: C.text },
  copyBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.accent },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  obsCard:   { backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16, marginBottom: 16 },
  obsTitle:  { fontSize: 13, fontWeight: '700', color: '#93c5fd', marginBottom: 8 },
  obsStep:   { fontSize: 12, color: '#bfdbfe', marginBottom: 4 },
  stopBtn:   { backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btn:       { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
});
