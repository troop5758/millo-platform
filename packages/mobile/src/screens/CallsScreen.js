/**
 * CallsScreen — paid audio/video calls (DM monetization).
 * Lists call history, end calls, creator approval.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, useColorScheme, ActivityIndicator, RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { get, post } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { dark, light } from '../theme/colors';

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(m) {
  if (m == null || m === 0) return '0m';
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function CallsScreen() {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [config, setConfig] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionSessionId, setActionSessionId] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const c = await get('/dm/calls/config');
      setConfig(c);
    } catch (e) {
      setError(e.message || 'Failed to load config');
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await get('/dm/calls/sessions?limit=50&offset=0');
      setSessions(data.sessions || []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load calls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadSessions();
  }, [loadConfig, loadSessions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadConfig();
    loadSessions();
  };

  const handleEndCall = async (sessionId) => {
    setActionSessionId(sessionId);
    try {
      await post(`/dm/calls/${sessionId}/end`, {});
      await loadSessions();
    } catch (e) {
      setError(e.message || 'Failed to end call');
    } finally {
      setActionSessionId(null);
    }
  };

  const handleApprove = async (sessionId) => {
    setActionSessionId(sessionId);
    try {
      await post(`/dm/calls/${sessionId}/approve`, {});
      await loadSessions();
    } catch (e) {
      setError(e.message || 'Failed to approve');
    } finally {
      setActionSessionId(null);
    }
  };

  const confirmEndCall = (session) => {
    Alert.alert(
      t('calls.endCall'),
      t('calls.endCallConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('calls.endCall'), style: 'destructive', onPress: () => handleEndCall(session._id) },
      ]
    );
  };

  const s = styles(C);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backLink}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('calls.title')}</Text>
      </View>

      {config && (
        <View style={s.configCard}>
          <Text style={s.configText}>
            {t('calls.pricingInfo', {
              free: config.freeBufferMinutes,
              rate: (config.centsPerMinute / 100).toFixed(2),
              max: config.maxSessionMinutes,
            })}
          </Text>
        </View>
      )}

      {error ? (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>{t('calls.noCalls')}</Text>
          <Text style={s.emptyDesc}>{t('calls.noCallsDesc')}</Text>
          <Text style={s.emptyHint}>{t('calls.requestFromProfile')}</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(i) => String(i._id)}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
          renderItem={({ item: s }) => {
            const isActive = !s.endedAt;
            const needsApproval = s.isCreator && s.endedAt && !s.approved;
            return (
              <View style={s.sessionCard}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{(s.otherDisplayName || 'U')[0].toUpperCase()}</Text>
                </View>
                <View style={s.sessionInfo}>
                  <View style={s.sessionRow}>
                    <Text style={s.sessionName} numberOfLines={1}>{s.otherDisplayName}</Text>
                    <Text style={s.sessionDate}>{formatDate(s.startedAt)}</Text>
                  </View>
                  <View style={s.sessionMeta}>
                    <Text style={s.metaText}>{formatMinutes(s.totalMinutes)}</Text>
                    {s.amountCents > 0 && <Text style={s.metaText}>{(s.amountCents / 100).toFixed(2)}</Text>}
                    {isActive && <Text style={s.activeBadge}>{t('calls.active')}</Text>}
                    {needsApproval && <Text style={s.pendingBadge}>{t('calls.pendingApproval')}</Text>}
                    {s.approved && <Text style={s.completedBadge}>{t('calls.completed')}</Text>}
                  </View>
                </View>
                <View style={s.actions}>
                  {isActive && (
                    <>
                      <TouchableOpacity
                        style={s.endBtn}
                        onPress={() => confirmEndCall(s)}
                        disabled={actionSessionId === s._id}
                      >
                        <Text style={s.endBtnText}>{t('calls.endCall')}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {needsApproval && (
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => handleApprove(s._id)}
                      disabled={actionSessionId === s._id}
                    >
                      <Text style={s.approveBtnText}>{t('calls.approve')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backLink:   { color: C.accent, fontSize: 15 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  configCard: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  configText: { fontSize: 13, color: C.textMuted },
  errorCard:  { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  errorText:  { fontSize: 13, color: '#ef4444' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  emptyDesc:  { fontSize: 14, color: C.textMuted, marginTop: 8, textAlign: 'center' },
  emptyHint:  { fontSize: 13, color: C.textMuted, marginTop: 2, textAlign: 'center' },
  list:       { padding: 16, gap: 8 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, gap: 12 },
  avatar:     { width: 48, height: 48, borderRadius: 24, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  sessionInfo: { flex: 1, minWidth: 0 },
  sessionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionName: { fontSize: 15, fontWeight: '600', color: C.text },
  sessionDate: { fontSize: 11, color: C.textMuted },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText:    { fontSize: 12, color: C.textMuted },
  activeBadge: { fontSize: 12, color: C.accent, fontWeight: '600' },
  pendingBadge: { fontSize: 12, color: '#d97706' },
  completedBadge: { fontSize: 12, color: '#16a34a' },
  actions:     { gap: 8 },
  endBtn:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ef4444' },
  endBtnText:  { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  approveBtn:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  approveBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
