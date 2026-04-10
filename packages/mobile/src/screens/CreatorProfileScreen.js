/**
 * CreatorProfileScreen — view any creator's public profile.
 * Route params: { creatorId }
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator,
  useColorScheme, RefreshControl, FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { dark, light } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function authFetch(path, token, opts = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  });
}

function fmtNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function Avatar({ uri, name, size = 80, C }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: C.accent + '30', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: C.accent }}>
        {(name || 'U')[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function CreatorProfileScreen({ route, navigation }) {
  const { creatorId } = route.params || {};
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { user, token } = useAuth();
  const { t } = useTranslation();

  const [profile,    setProfile]    = useState(null);
  const [stats,      setStats]      = useState(null);
  const [streams,    setStreams]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following,  setFollowing]  = useState(false);
  const [subbed,     setSubbed]     = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [callBusy,   setCallBusy]   = useState(false);
  const [tab,        setTab]        = useState('streams'); // streams | about

  const isMe = user && String(user._id) === String(creatorId);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, streamsRes] = await Promise.allSettled([
        authFetch(`/content/creators/${creatorId}`, token),
        authFetch(`/content/streams?creatorId=${creatorId}&limit=12`, token),
      ]);
      if (profileRes.status === 'fulfilled') {
        const d = profileRes.value;
        setProfile(d.creator || d.profile || d);
        setStats(d.stats || d.creator?.stats || null);
        setFollowing(d.isFollowing ?? d.creator?.isFollowing ?? false);
        setSubbed(d.isSubscribed ?? d.creator?.isSubscribed ?? false);
      }
      if (streamsRes.status === 'fulfilled') {
        setStreams(streamsRes.value.streams || []);
      }
    } catch { /* show cached */ }
    setLoading(false);
    setRefreshing(false);
  }, [creatorId, token]);

  useEffect(() => { load(); }, [load]);

  const handleFollow = async () => {
    if (!user) { navigation.navigate('Login'); return; }
    setFollowBusy(true);
    try {
      if (following) {
        await authFetch(`/profile/follow/${creatorId}`, token, { method: 'DELETE' });
        setFollowing(false);
      } else {
        await authFetch(`/profile/follow/${creatorId}`, token, { method: 'POST' });
        setFollowing(true);
      }
    } catch { /* ignore */ }
    setFollowBusy(false);
  };

  const s = styles(C);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: C.textMuted, fontSize: 16 }}>{t('creatorProfile.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName  = profile.displayName  || profile.username || 'Creator';
  const bio          = profile.bio          || '';
  const avatarUrl    = profile.avatarUrl    || null;
  const coverUrl     = profile.coverUrl     || null;
  const followersCount = profile.followersCount ?? stats?.followers ?? 0;
  const subsCount      = profile.subscribersCount ?? stats?.subscribers ?? 0;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}
      >
        {/* Cover / Back button */}
        <View style={s.coverWrap}>
          {coverUrl
            ? <Image source={{ uri: coverUrl }} style={s.cover} resizeMode="cover" />
            : <View style={[s.cover, { backgroundColor: C.accent + '22' }]} />}
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>‹</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar row */}
        <View style={s.avatarRow}>
          <View style={s.avatarBorder}>
            <Avatar uri={avatarUrl} name={displayName} size={76} C={C} />
          </View>
          <View style={{ flex: 1 }} />
          {!isMe && (
            <TouchableOpacity
              style={[s.followBtn, following && s.followingBtn]}
              onPress={handleFollow}
              disabled={followBusy}
            >
              {followBusy
                ? <ActivityIndicator color={following ? C.accent : '#fff'} size="small" />
                : <Text style={[s.followBtnText, following && { color: C.accent }]}>
                    {following ? t('creatorProfile.unfollow') : t('creatorProfile.follow')}
                  </Text>}
            </TouchableOpacity>
          )}
          {!isMe && (
            <TouchableOpacity
              style={s.subscribeBtn}
              onPress={() => navigation.navigate('Subscribe', { creatorId })}
            >
              <Text style={s.subscribeBtnText}>{subbed ? t('subscribe.alreadySubscribed') : t('creatorProfile.subscribe')}</Text>
            </TouchableOpacity>
          )}
          {!isMe && (
            <TouchableOpacity
              style={s.callBtn}
              onPress={handleRequestCall}
              disabled={callBusy}
            >
              <Text style={s.callBtnText}>{callBusy ? '…' : t('calls.requestCall')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Name / stats */}
        <View style={s.nameRow}>
          <Text style={s.displayName}>{displayName}</Text>
          {profile.username && <Text style={s.username}>@{profile.username}</Text>}
        </View>

        <View style={s.statsRow}>
          {[
            { label: t('creatorProfile.followers'),  value: fmtNum(followersCount) },
            { label: t('subscriptions.title'), value: fmtNum(subsCount) },
            { label: t('creatorProfile.streams'),    value: fmtNum(streams.length) },
          ].map((st) => (
            <View key={st.label} style={s.statItem}>
              <Text style={s.statValue}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {['streams', 'about'].map((tabKey) => (
            <TouchableOpacity key={tabKey} style={[s.tabBtn, tab === tabKey && s.tabBtnActive]} onPress={() => setTab(tabKey)}>
              <Text style={[s.tabText, tab === tabKey && s.tabTextActive]}>
                {tabKey === 'streams' ? t('creatorProfile.streams') : t('profile.bio')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {tab === 'streams' ? (
          streams.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontSize: 15 }}>{t('creatorProfile.noContent')}</Text>
            </View>
          ) : (
            <View style={s.streamGrid}>
              {streams.map((stream) => (
                <TouchableOpacity
                  key={String(stream._id)}
                  style={s.streamCard}
                  onPress={() => navigation.navigate('Tabs', { screen: 'Live' })}
                >
                  <View style={s.streamThumb}>
                    {stream.thumbnailUrl
                      ? <Image source={{ uri: stream.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <View style={{ width: '100%', height: '100%', backgroundColor: C.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 28 }}>📺</Text>
                        </View>}
                    {stream.status === 'live' && (
                      <View style={s.liveBadge}>
                        <Text style={s.liveBadgeText}>{t('creatorProfile.live')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.streamTitle} numberOfLines={2}>{stream.title || 'Untitled'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        ) : (
          <View style={{ padding: 20 }}>
            {bio ? (
              <Text style={{ color: C.text, fontSize: 15, lineHeight: 22 }}>{bio}</Text>
            ) : (
              <Text style={{ color: C.textMuted, fontSize: 15 }}>{t('common.noContent')}</Text>
            )}
            {profile.socialLinks && Object.entries(profile.socialLinks).map(([k, v]) => v ? (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
                <Text style={{ color: C.textMuted, fontSize: 13, width: 64, textTransform: 'capitalize' }}>{k}</Text>
                <Text style={{ color: C.accent, fontSize: 13 }}>{v}</Text>
              </View>
            ) : null)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  coverWrap:   { height: 140, position: 'relative' },
  cover:       { width: '100%', height: '100%' },
  backBtn:     { position: 'absolute', top: 12, left: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarRow:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -40, marginBottom: 8, gap: 10 },
  avatarBorder:{ borderWidth: 3, borderColor: C.bg, borderRadius: 44, overflow: 'hidden' },
  followBtn:   { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: C.accent, minWidth: 80, alignItems: 'center' },
  followingBtn:{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.accent },
  followBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
  subscribeBtn:{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, minWidth: 90, alignItems: 'center' },
  subscribeBtnText:{ fontSize: 13, fontWeight: '600', color: C.text },
  callBtn:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.accent, minWidth: 90, alignItems: 'center' },
  callBtnText:   { fontSize: 13, fontWeight: '600', color: C.accent },
  nameRow:     { paddingHorizontal: 20, marginBottom: 12 },
  displayName: { fontSize: 20, fontWeight: '700', color: C.text },
  username:    { fontSize: 13, color: C.textMuted, marginTop: 2 },
  statsRow:    { flexDirection: 'row', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 16, gap: 24 },
  statItem:    { alignItems: 'center' },
  statValue:   { fontSize: 18, fontWeight: '700', color: C.text },
  statLabel:   { fontSize: 12, color: C.textMuted, marginTop: 2 },
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:{ borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText:     { fontSize: 14, fontWeight: '500', color: C.textMuted },
  tabTextActive:{ color: C.text, fontWeight: '700' },
  streamGrid:  { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  streamCard:  { width: '47%', marginBottom: 4 },
  streamThumb: { aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: C.bgCard, marginBottom: 6 },
  liveBadge:   { position: 'absolute', top: 6, left: 6, backgroundColor: '#ef4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  liveBadgeText:{ fontSize: 10, fontWeight: '800', color: '#fff' },
  streamTitle: { fontSize: 12, fontWeight: '500', color: C.text, lineHeight: 17 },
});
