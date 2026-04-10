/**
 * SubscribeScreen — subscribe to a creator using coins (mobile).
 * Route: Subscribe, params: { creatorId }
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Modal, useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { MilloCoin } from '../components/MilloCoin';
import { dark, light } from '../theme/colors';

const PERK_KEYS = ['perk1', 'perk2', 'perk3', 'perk4', 'perk5'];

export default function SubscribeScreen({ route, navigation }) {
  const { creatorId } = route.params ?? {};
  const scheme = useColorScheme();
  const C      = scheme === 'dark' ? dark : light;
  const s      = styles(C);
  const { t }  = useTranslation();

  const [profile,    setProfile]    = useState(null);
  const [subStatus,  setSubStatus]  = useState(null);
  const [subId,      setSubId]      = useState(null);
  const [wallet,     setWallet]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    const [profileRes, subRes, walletRes] = await Promise.allSettled([
      get(`/content/creators/${creatorId}`),
      get(`/payments/subscriptions/status/${creatorId}`).catch((err) => { console.warn('[SubscribeScreen] status fetch failed:', err?.message); return { subscribed: false }; }),
      get('/content/wallet').catch((err) => { console.warn('[SubscribeScreen] wallet fetch failed:', err?.message); return { balanceCents: 0 }; }),
    ]);
    if (profileRes.status === 'fulfilled') {
      const d = profileRes.value;
      setProfile(d.creator || d.profile || d);
    }
    if (subRes.status === 'fulfilled') {
      setSubStatus(subRes.value);
      setSubId(subRes.value?._id || subRes.value?.subscriptionId || null);
    }
    if (walletRes.status === 'fulfilled') setWallet(walletRes.value.balanceCents ?? 0);
    setLoading(false);
  }, [creatorId]);

  useEffect(() => { load(); }, [load]);

  const priceCents = subStatus?.priceCents ?? 500;
  const isSubscribed = subStatus?.subscribed ?? false;

  const handleSubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      await post('/payments/subscriptions/creator', { creatorId });
      setSuccess(true);
      await load();
    } catch (e) {
      if (e.message === 'INSUFFICIENT_COINS') {
        setError(t('subscribe.notEnough'));
      } else if (e.message === 'ALREADY_SUBSCRIBED') {
        setError(t('subscribe.alreadySubscribed'));
      } else {
        setError(e.message || t('common.error'));
      }
    }
    setBusy(false);
  };

  const handleCancel = () => setConfirmCancel(true);

  const confirmCancelNow = async () => {
    setConfirmCancel(false);
    setBusy(true);
    setError(null);
    try {
      await post('/payments/subscriptions/cancel', subId
        ? { subscriptionId: subId }
        : { creatorId });
      await load();
    } catch (e) {
      setError(
        e.message === 'NOT_FOUND'
          ? t('subscribe.notFound', 'Subscription not found. It may have already been cancelled.')
          : e.message || t('common.error')
      );
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </SafeAreaView>
    );
  }

  const displayName = profile?.displayName || t('subscribe.creatorFallback');
  const balance     = wallet ?? 0;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ color: C.accent, fontSize: 16 }}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('subscribe.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* Creator card */}
        <View style={s.creatorCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{displayName[0].toUpperCase()}</Text>
          </View>
          <Text style={s.creatorName}>{displayName}</Text>
          <Text style={s.planLabel}>{t('subscribe.title')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2 }}>
            <MilloCoin size={18} />
            <Text style={s.price}>{t('subscribe.coinsPerMonth', { count: priceCents.toLocaleString() })}</Text>
          </View>
        </View>

        {/* Status: subscribed */}
        {isSubscribed && (
          <View style={s.activeBadge}>
            <Text style={s.activeBadgeText}>✓  {t('subscribe.alreadySubscribed')}</Text>
          </View>
        )}

        {/* Success state */}
        {success && (
          <View style={s.successBox}>
            <Text style={s.successTitle}>{t('subscribe.successTitle')}</Text>
            <Text style={s.successSub}>{t('subscribe.successDesc', { name: displayName })}</Text>
          </View>
        )}

        {/* Perks */}
        <View style={s.perksCard}>
          <Text style={s.perksTitle}>{t('subscribe.title')}</Text>
          {PERK_KEYS.map((k) => (
            <Text key={k} style={s.perk}>{t(`subscribe.${k}`)}</Text>
          ))}
        </View>

        {/* Wallet */}
        <View style={s.balanceRow}>
          <Text style={s.balanceLabel}>{t('subscribe.balance')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MilloCoin size={16} />
            <Text style={[s.balanceValue, balance < priceCents && { color: C.red }]}>
              {t('coinStore.balance', { count: balance.toLocaleString() })}
            </Text>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* CTA */}
        {!isSubscribed ? (
          <TouchableOpacity
            style={[s.btn, (busy || balance < priceCents) && { opacity: 0.5 }]}
            onPress={handleSubscribe}
            disabled={busy || balance < priceCents}
            activeOpacity={0.8}>
            {busy
              ? <ActivityIndicator color="#fff" />
              : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Text style={s.btnText}>{t('subscribe.subscribe')} ·</Text>
                  <MilloCoin size={16} />
                  <Text style={s.btnText}>{priceCents.toLocaleString()}/mo</Text>
                </View>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={busy} activeOpacity={0.8}>
            <Text style={s.cancelBtnText}>{busy ? t('subscribe.subscribing') : t('subscribe.cancel')}</Text>
          </TouchableOpacity>
        )}

        <Text style={s.terms}>{t('subscribe.termsNote')}</Text>
      </ScrollView>

      {/* Cancel confirmation modal */}
      <Modal visible={confirmCancel} transparent animationType="fade" onRequestClose={() => setConfirmCancel(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('subscribe.cancel')}?</Text>
            <Text style={s.dialogBody}>
              {t('subscribe.manage')}
            </Text>
            <View style={s.dialogRow}>
              <TouchableOpacity style={s.dialogKeep} onPress={() => setConfirmCancel(false)}>
                <Text style={s.dialogKeepText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogConfirm} onPress={confirmCancelNow}>
                <Text style={s.dialogConfirmText}>{t('subscribe.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:        { width: 60 },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: C.text },
  body:           { padding: 20, gap: 16 },
  creatorCard:    { backgroundColor: C.bgCard, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  avatar:         { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:     { color: '#fff', fontWeight: '900', fontSize: 28 },
  creatorName:    { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4 },
  planLabel:      { fontSize: 13, color: C.textMuted, marginBottom: 8 },
  price:          { fontSize: 22, fontWeight: '900', color: C.accent },
  activeBadge:    { backgroundColor: '#dcfce7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  activeBadgeText:{ color: '#16a34a', fontWeight: '700', fontSize: 14 },
  successBox:     { backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#86efac' },
  successTitle:   { fontSize: 18, fontWeight: '800', color: '#16a34a', marginBottom: 6 },
  successSub:     { fontSize: 14, color: '#15803d', lineHeight: 22 },
  perksCard:      { backgroundColor: C.bgCard, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
  perksTitle:     { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  perk:           { fontSize: 14, color: C.text, marginBottom: 10, lineHeight: 20 },
  balanceRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: C.border },
  balanceLabel:   { fontSize: 14, color: C.textMuted },
  balanceValue:   { fontSize: 14, fontWeight: '700', color: C.text },
  errorBox:       { backgroundColor: '#fee2e2', borderRadius: 12, padding: 14 },
  errorText:      { color: '#dc2626', fontSize: 13 },
  btn:            { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText:        { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn:      { borderWidth: 1, borderColor: '#fca5a5', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:  { color: '#dc2626', fontWeight: '600', fontSize: 15 },
  terms:          { fontSize: 12, color: C.textMuted, textAlign: 'center', lineHeight: 18 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog:         { backgroundColor: C.bgCard, borderRadius: 20, padding: 24, width: '100%' },
  dialogTitle:    { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 },
  dialogBody:     { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 },
  dialogRow:      { flexDirection: 'row', gap: 12 },
  dialogKeep:     { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  dialogKeepText: { fontWeight: '600', color: C.text },
  dialogConfirm:  { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' },
  dialogConfirmText: { fontWeight: '700', color: '#fff', fontSize: 13 },
});
