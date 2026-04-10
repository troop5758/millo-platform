/**
 * WalletScreen — coin balance, recent transactions and payout requests.
 * Route: Wallet
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Modal, TextInput, useColorScheme,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { MilloCoin } from '../components/MilloCoin';
import { dark, light } from '../theme/colors';

const TX_ICONS = {
  gift_sent:        '🎁',
  gift_received:    '🎁',
  coin_purchase:    null,
  subscription_fee: '⭐',
  subscription_rev: '⭐',
  payout:           '💸',
  refund:           '↩️',
  default:          '💳',
};

function txIcon(type = '') {
  for (const [key, icon] of Object.entries(TX_ICONS)) {
    if (type.includes(key)) return icon;
  }
  return TX_ICONS.default;
}

function fmt(cents) {
  if (cents === undefined || cents === null) return '–';
  const sign = cents >= 0 ? '+' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WalletScreen({ navigation }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { t } = useTranslation();
  const s = styles(C);

  const [balance,      setBalance]      = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payouts,      setPayouts]      = useState([]);
  const [loading,      setLoading]      = useState(true);

  const [payoutAmt,    setPayoutAmt]    = useState('');
  const [requesting,   setRequesting]   = useState(false);
  const [payoutError,  setPayoutError]  = useState(null);
  const [payoutOk,     setPayoutOk]     = useState(null);
  const [confirmPayout, setConfirmPayout] = useState(null); // dollars amount

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, txRes, poRes] = await Promise.allSettled([
        get('/content/wallet'),
        get('/payments/wallet/transactions?limit=30'),
        get('/payments/payouts/history'),
      ]);
      if (wRes.status  === 'fulfilled') setBalance(wRes.value?.wallet?.coins ?? wRes.value?.coins ?? null);
      if (txRes.status === 'fulfilled') setTransactions(txRes.value?.transactions ?? []);
      if (poRes.status === 'fulfilled') setPayouts(poRes.value?.payouts ?? []);
    } catch (_) {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRequestPayout = () => {
    const dollars = parseFloat(payoutAmt);
    setPayoutError(null);
    setPayoutOk(null);
    if (!dollars || dollars < 5) {
      setPayoutError(t('wallet.minPayout'));
      return;
    }
    setConfirmPayout(dollars);
  };

  const submitPayout = async () => {
    const dollars = confirmPayout;
    setConfirmPayout(null);
    const amountCents = Math.round(dollars * 100);
    setRequesting(true);
    setPayoutError(null);
    try {
      await post('/payments/payouts/request', { amountCents, provider: 'stripe' });
      setPayoutOk(t('wallet.payoutSubmitted'));
      setPayoutAmt('');
      load();
    } catch (e) {
      setPayoutError(e?.message || 'Failed to submit payout.');
    } finally {
      setRequesting(false);
    }
  };

  const statusColor = (status) => {
    if (status === 'paid')      return C.green;
    if (status === 'rejected')  return C.red;
    if (status === 'pending')   return C.amber;
    return C.textMuted;
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('wallet.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            {/* Balance card */}
            <View style={s.balanceCard}>
              <Text style={s.balanceLabel}>{t('wallet.coinBalance')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MilloCoin size={28} />
                <Text style={s.balanceValue}>
                  {balance !== null ? balance.toLocaleString() : '–'}
                </Text>
              </View>
              <TouchableOpacity
                style={s.buyBtn}
                onPress={() => navigation.navigate('CoinStore')}
              >
                <Text style={s.buyBtnText}>{t('wallet.buyCoins')}</Text>
              </TouchableOpacity>
            </View>

            {/* Request payout */}
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('wallet.requestPayout')}</Text>
              <Text style={s.cardSub}>
                Earnings from gifts and subscriptions can be withdrawn to your connected Stripe account.
                Minimum $5.00 · Processing 1–3 business days.
              </Text>
              <View style={s.payoutRow}>
                <TextInput
                  style={s.input}
                  placeholder={t('wallet.amountPlaceholder')}
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                  value={payoutAmt}
                  onChangeText={(v) => { setPayoutAmt(v); setPayoutError(null); }}
                />
                <TouchableOpacity
                  style={[s.payoutBtn, requesting && { opacity: 0.5 }]}
                  onPress={handleRequestPayout}
                  disabled={requesting}
                >
                  {requesting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.payoutBtnText}>{t('wallet.request')}</Text>}
                </TouchableOpacity>
              </View>
              {payoutError && (
                <View style={s.feedbackErr}><Text style={s.feedbackErrText}>{payoutError}</Text></View>
              )}
              {payoutOk && (
                <View style={s.feedbackOk}><Text style={s.feedbackOkText}>{payoutOk}</Text></View>
              )}
            </View>

            {/* Payout history */}
            {payouts.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>{t('wallet.payoutHistory')}</Text>
                {payouts.map((po) => (
                  <View key={String(po._id)} style={s.poRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.poAmt}>${(po.amountCents / 100).toFixed(2)}</Text>
                      <Text style={s.poDate}>{fmtDate(po.createdAt)}</Text>
                    </View>
                    <View style={[s.badge, { borderColor: statusColor(po.status) }]}>
                      <Text style={[s.badgeText, { color: statusColor(po.status) }]}>
                        {po.status ?? 'pending'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Recent transactions */}
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('wallet.recentTransactions')}</Text>
              {transactions.length === 0 ? (
                <Text style={s.empty}>{t('wallet.noTransactions')}</Text>
              ) : (
                transactions.map((tx) => (
                  <View key={String(tx._id)} style={s.txRow}>
                    <Text style={s.txIcon}>{txIcon(tx.type)}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.txType}>{(tx.type ?? 'transaction').replace(/_/g, ' ')}</Text>
                      <Text style={s.txDate}>{fmtDate(tx.createdAt)}</Text>
                    </View>
                    {tx.coins !== undefined ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={[s.txAmt, { color: (tx.amountCents ?? 0) >= 0 ? C.green : C.red }]}>
                          {tx.coins >= 0 ? '+' : ''}{tx.coins}
                        </Text>
                        <MilloCoin size={14} />
                      </View>
                    ) : (
                      <Text style={[s.txAmt, { color: (tx.amountCents ?? 0) >= 0 ? C.green : C.red }]}>
                        {fmt(tx.amountCents)}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Payout confirmation modal */}
      <Modal visible={!!confirmPayout} transparent animationType="fade" onRequestClose={() => setConfirmPayout(null)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('wallet.confirmPayoutTitle')}</Text>
            <Text style={s.dialogBody}>
              {t('wallet.confirmPayoutBody', { amount: confirmPayout?.toFixed(2) })}
            </Text>
            <View style={s.dialogRow}>
              <TouchableOpacity style={s.dialogCancel} onPress={() => setConfirmPayout(null)}>
                <Text style={s.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogConfirm} onPress={submitPayout}>
                <Text style={s.dialogConfirmText}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back:         { width: 40, justifyContent: 'center' },
  backArrow:    { fontSize: 28, color: C.text, lineHeight: 32 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: C.text },
  body:         { padding: 16, gap: 16, paddingBottom: 40 },

  balanceCard:  { backgroundColor: C.accent, borderRadius: 16, padding: 24, alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800' },
  buyBtn:       { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
                  paddingHorizontal: 24, paddingVertical: 10 },
  buyBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700' },

  card:         { backgroundColor: C.bgCard, borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: C.border },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardSub:      { fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 17 },

  payoutRow:    { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input:        { flex: 1, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1,
                  borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 15, color: C.text },
  payoutBtn:    { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 18,
                  paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  payoutBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  poRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: C.border },
  poAmt:        { fontSize: 15, fontWeight: '700', color: C.text },
  poDate:       { fontSize: 12, color: C.textMuted, marginTop: 2 },
  badge:        { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText:    { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  txRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: C.border },
  txIcon:       { fontSize: 20, width: 30, textAlign: 'center' },
  txType:       { fontSize: 13, fontWeight: '600', color: C.text, textTransform: 'capitalize' },
  txDate:       { fontSize: 11, color: C.textMuted, marginTop: 2 },
  txAmt:        { fontSize: 14, fontWeight: '700' },

  empty:        { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 20 },
  feedbackErr:  { marginTop: 10, backgroundColor: '#fee2e2', borderRadius: 10, padding: 12 },
  feedbackErrText: { color: '#dc2626', fontSize: 13 },
  feedbackOk:   { marginTop: 10, backgroundColor: '#dcfce7', borderRadius: 10, padding: 12 },
  feedbackOkText:  { color: '#15803d', fontSize: 13 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog:       { backgroundColor: C.bgCard, borderRadius: 20, padding: 24, width: '100%' },
  dialogTitle:  { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 },
  dialogBody:   { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 },
  dialogRow:    { flexDirection: 'row', gap: 12 },
  dialogCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  dialogCancelText: { fontWeight: '600', color: C.text },
  dialogConfirm: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center' },
  dialogConfirmText: { fontWeight: '700', color: '#fff' },
});
