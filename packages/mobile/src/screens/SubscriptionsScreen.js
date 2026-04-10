/**
 * SubscriptionsScreen — manage active creator subscriptions (mobile).
 * Route: Subscriptions
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Modal, useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { dark, light } from '../theme/colors';

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtPrice(cents) {
  if (!cents) return null; // caller will use t('subscriptions.freePrice')
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status, C }) {
  const color = status === 'active' ? C.green : status === 'cancelled' ? C.red : C.amber;
  return (
    <View style={[badgeStyle.wrap, { borderColor: color }]}>
      <Text style={[badgeStyle.text, { color }]}>{status ?? 'unknown'}</Text>
    </View>
  );
}

const badgeStyle = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});

export default function SubscriptionsScreen({ navigation }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const s = styles(C);

  const [subs,        setSubs]        = useState([]);
  const [profiles,    setProfiles]    = useState({});
  const [loading,     setLoading]     = useState(true);
  const [cancelling,  setCancelling]  = useState(null);
  const [confirmSub,  setConfirmSub]  = useState(null); // sub object pending cancel
  const [cancelError, setCancelError] = useState(null);
  const [cancelOkMsg, setCancelOkMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get('/payments/subscriptions/my');
      const list = data?.subscriptions ?? [];
      setSubs(list);

      // Fetch creator profiles for enrichment
      const creatorIds = [...new Set(list.map((s) => String(s.creatorId)).filter(Boolean))];
      if (creatorIds.length > 0) {
        const settled = await Promise.allSettled(
          creatorIds.map((id) => get(`/content/creators/${id}`))
        );
        const map = {};
        settled.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            const p = r.value?.creator ?? r.value?.profile ?? r.value;
            if (p) map[creatorIds[idx]] = p;
          }
        });
        setProfiles(map);
      }
    } catch (_) {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = (sub) => {
    setCancelError(null);
    setCancelOkMsg(null);
    setConfirmSub(sub);
  };

  const confirmCancelNow = async () => {
    const sub = confirmSub;
    const profile = profiles[String(sub.creatorId)];
    const name = profile?.displayName || t('subscriptions.creatorFallback');
    setConfirmSub(null);
    setCancelling(String(sub._id));
    setCancelError(null);
    try {
      await post('/payments/subscriptions/cancel', { subscriptionId: String(sub._id) });
      setCancelOkMsg(t('subscriptions.cancelOk', { name }));
      load();
    } catch (e) {
      setCancelError(e?.message || t('subscriptions.cancelFailed'));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('subscriptions.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Inline feedback banners */}
      {cancelOkMsg && (
        <View style={s.successBanner}>
          <Text style={s.successBannerText}>✓ {cancelOkMsg}</Text>
          <TouchableOpacity onPress={() => setCancelOkMsg(null)}><Text style={s.bannerDismiss}>✕</Text></TouchableOpacity>
        </View>
      )}
      {cancelError && (
        <View style={s.errorBanner}>
          <Text style={s.errorBannerText}>{cancelError}</Text>
          <TouchableOpacity onPress={() => setCancelError(null)}><Text style={s.bannerDismiss}>✕</Text></TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.body}>

          {subs.length === 0 ? (
            /* Empty state */
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>⭐</Text>
              <Text style={s.emptyTitle}>{t('subscriptions.noSubscriptions')}</Text>
              <Text style={s.emptySub}>{t('subscriptions.emptySub')}</Text>
              <TouchableOpacity
                style={s.discoverBtn}
                onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
              >
                <Text style={s.discoverBtnText}>{t('subscriptions.discoverCreators')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.count}>{t('subscriptions.count_other', { count: subs.length })}</Text>
              {subs.map((sub) => {
                const profile = profiles[String(sub.creatorId)];
                const name    = profile?.displayName || t('subscriptions.creatorFallback');
                const handle  = profile?.username ? `@${profile.username}` : '';
                const isActive = sub.status === 'active';
                const isCancelling = cancelling === String(sub._id);

                return (
                  <View key={String(sub._id)} style={s.card}>
                    {/* Creator info */}
                    <View style={s.cardTop}>
                      <View style={s.avatar}>
                        <Text style={s.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.creatorName}>{name}</Text>
                        {!!handle && <Text style={s.creatorHandle}>{handle}</Text>}
                      </View>
                      <StatusBadge status={sub.status} C={C} />
                    </View>

                    {/* Details */}
                    <View style={s.details}>
                      <DetailRow label={t('subscriptions.plan')}    value={sub.plan ?? 'Standard'} C={C} />
                      <DetailRow label={t('subscriptions.price')}   value={fmtPrice(sub.priceCents) || t('subscriptions.freePrice')} C={C} />
                      <DetailRow label={t('subscriptions.started')} value={fmtDate(sub.startsAt)}  C={C} />
                      {sub.status === 'active' && sub.endsAt && (
                        <DetailRow label={t('subscriptions.renews')} value={fmtDate(sub.endsAt)} C={C} />
                      )}
                      {sub.status === 'cancelled' && sub.endsAt && (
                        <DetailRow label={t('subscriptions.accessUntil')} value={fmtDate(sub.endsAt)} C={C} />
                      )}
                    </View>

                    {/* Actions */}
                    <View style={s.actions}>
                      <TouchableOpacity
                        style={s.profileBtn}
                        onPress={() => navigation.navigate('CreatorProfile', { creatorId: String(sub.creatorId) })}
                      >
                        <Text style={s.profileBtnText}>{t('subscriptions.viewProfile')}</Text>
                      </TouchableOpacity>
                      {isActive && (
                        <TouchableOpacity
                          style={[s.cancelBtn, isCancelling && { opacity: 0.5 }]}
                          onPress={() => handleCancel(sub)}
                          disabled={isCancelling}
                        >
                          {isCancelling
                            ? <ActivityIndicator size="small" color={C.red} />
                            : <Text style={s.cancelBtnText}>{t('subscriptions.cancelBtn')}</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Cancel confirmation modal */}
      {confirmSub && (() => {
        const profile = profiles[String(confirmSub.creatorId)];
        const name = profile?.displayName || t('subscriptions.creatorFallback');
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmSub(null)}>
            <View style={s.overlay}>
              <View style={s.dialog}>
                <Text style={s.dialogTitle}>{t('subscriptions.dialogTitle')}</Text>
                <Text style={s.dialogBody}>
                  {t('subscriptions.dialogBody', { name, date: fmtDate(confirmSub.endsAt) })}
                </Text>
                <View style={s.dialogRow}>
                  <TouchableOpacity style={s.dialogKeep} onPress={() => setConfirmSub(null)}>
                    <Text style={s.dialogKeepText}>{t('subscriptions.keep')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.dialogCancel} onPress={confirmCancelNow}>
                    <Text style={s.dialogCancelText}>{t('subscriptions.cancelSub')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

function DetailRow({ label, value, C }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: C.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{value}</Text>
    </View>
  );
}

const styles = (C) => StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back:          { width: 40, justifyContent: 'center' },
  backArrow:     { fontSize: 28, color: C.text, lineHeight: 32 },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: C.text },
  body:          { padding: 16, gap: 12, paddingBottom: 40 },
  count:         { fontSize: 13, color: C.textMuted, marginBottom: 4 },

  card:          { backgroundColor: C.bgCard, borderRadius: 16, padding: 16,
                   borderWidth: 1, borderColor: C.border },
  cardTop:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent,
                   justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  creatorName:   { fontSize: 15, fontWeight: '700', color: C.text },
  creatorHandle: { fontSize: 12, color: C.textMuted, marginTop: 1 },

  details:       { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginBottom: 10 },
  actions:       { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },

  profileBtn:    { flex: 1, borderWidth: 1, borderColor: C.accent, borderRadius: 10,
                   paddingVertical: 9, alignItems: 'center' },
  profileBtnText:{ color: C.accent, fontSize: 13, fontWeight: '700' },
  cancelBtn:     { flex: 1, borderWidth: 1, borderColor: C.red, borderRadius: 10,
                   paddingVertical: 9, alignItems: 'center' },
  cancelBtnText: { color: C.red, fontSize: 13, fontWeight: '700' },

  emptyWrap:     { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 56, marginBottom: 16 },
  emptyTitle:    { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptySub:      { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  discoverBtn:   { marginTop: 24, backgroundColor: C.accent, borderRadius: 14,
                   paddingHorizontal: 28, paddingVertical: 13 },
  discoverBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  successBanner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dcfce7', paddingHorizontal: 16, paddingVertical: 10 },
  successBannerText: { color: '#15803d', fontSize: 13, fontWeight: '600', flex: 1 },
  errorBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fee2e2', paddingHorizontal: 16, paddingVertical: 10 },
  errorBannerText:{ color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 },
  bannerDismiss:  { color: C.textMuted, fontSize: 16, paddingLeft: 10 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog:         { backgroundColor: C.bgCard, borderRadius: 20, padding: 24, width: '100%' },
  dialogTitle:    { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 },
  dialogBody:     { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 },
  dialogRow:      { flexDirection: 'row', gap: 12 },
  dialogKeep:     { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  dialogKeepText: { fontWeight: '600', color: C.text },
  dialogCancel:   { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' },
  dialogCancelText: { fontWeight: '700', color: '#fff', fontSize: 13 },
});
