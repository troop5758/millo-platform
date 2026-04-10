/**
 * CoinStoreScreen — buy coin packs using Stripe (via browser redirect).
 * Route: CoinStore
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, useColorScheme,
} from 'react-native';
import { MilloCoin } from '../components/MilloCoin';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { get, post, getToken } from '../api/client';
import { dark, light } from '../theme/colors';

WebBrowser.maybeCompleteAuthSession();

const API_BASE = Constants.expoConfig?.extra?.apiUrl ?? 'https://api.milloapp.com';

/* ── Default packs if API unavailable ── */
const DEFAULT_PACKS = [
  { id: 'starter', name: 'Starter',  coins: 100,   amountCents: 99,   badge: null },
  { id: 'basic',   name: 'Basic',    coins: 500,   amountCents: 399,  badge: null },
  { id: 'popular', name: 'Popular',  coins: 1200,  amountCents: 799,  badge: '🔥 Popular' },
  { id: 'pro',     name: 'Pro',      coins: 3000,  amountCents: 1799, badge: 'Best Value' },
  { id: 'mega',    name: 'Mega',     coins: 6500,  amountCents: 3499, badge: null },
  { id: 'ultra',   name: 'Ultra',    coins: 15000, amountCents: 7499, badge: '⚡ Ultra' },
];

function fmtPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function fmtCoins(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return String(n);
}

/* CoinIcon is now the real Millo coin image */
function CoinIcon({ size = 20, style }) {
  return <MilloCoin size={size} style={style} />;
}

export default function CoinStoreScreen({ navigation }) {
  const scheme = useColorScheme();
  const C      = scheme === 'dark' ? dark : light;
  const { t }  = useTranslation();
  const s      = styles(C);

  const [packs,    setPacks]   = useState(DEFAULT_PACKS);
  const [balance,  setBalance] = useState(null);
  const [loading,  setLoading] = useState(true);
  const [buying,   setBuying]  = useState(null);
  const [flashMsg, setFlashMsg] = useState(null); // { type: 'ok'|'err', text }

  const load = useCallback(async () => {
    setLoading(true);
    const [pricingRes, walletRes] = await Promise.allSettled([
      fetch(`${API_BASE}/pricing/config`).then((r) => r.json()),
      get('/content/wallet'),
    ]);
    if (pricingRes.status === 'fulfilled') {
      const cfg   = pricingRes.value?.config;
      const pList = cfg?.coinPacks;
      if (Array.isArray(pList) && pList.length) setPacks(pList);
    }
    if (walletRes.status === 'fulfilled') {
      setBalance(walletRes.value?.balanceCents ?? walletRes.value?.wallet?.balanceCents ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleBuy = async (pack) => {
    if (buying) return;
    setBuying(pack.id);
    try {
      const token       = await getToken();
      const redirectUri = Linking.createURL('/coins/success');

      // Request a Stripe Checkout Session
      const res = await fetch(`${API_BASE}/payments/coins/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ packId: pack.id, redirectUrl: redirectUri }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not start checkout');
      }

      if (data.stub || !data.redirectUrl) {
        await load();
        setFlashMsg({ type: 'ok', text: t('coinStore.devModeAdded', { count: pack.coins.toLocaleString() }) });
        setBuying(null);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.redirectUrl, redirectUri);
      if (result.type === 'success') {
        await new Promise((r) => setTimeout(r, 1500));
        await load();
        setFlashMsg({ type: 'ok', text: t('coinStore.coinsAdded', { count: pack.coins.toLocaleString() }) });
      }
    } catch (e) {
      setFlashMsg({ type: 'err', text: e.message || t('coinStore.buyFailed') });
    }
    setBuying(null);
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('coinStore.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Flash message */}
        {flashMsg && (
          <TouchableOpacity
            onPress={() => setFlashMsg(null)}
            activeOpacity={0.9}
            style={[s.flash, flashMsg.type === 'err' ? s.flashErr : s.flashOk]}
          >
            <Text style={[s.flashText, { color: flashMsg.type === 'err' ? '#dc2626' : '#15803d' }]}>
              {flashMsg.type === 'ok' ? '🎉 ' : '⚠ '}{flashMsg.text}
            </Text>
            <Text style={s.flashDismiss}>Tap to dismiss</Text>
          </TouchableOpacity>
        )}

        {/* Balance card */}
        <View style={s.balanceCard}>
          <View>
            <Text style={s.balanceLabel}>{t('wallet.coinBalance')}</Text>
            <Text style={s.balanceValue}>
              {balance === null ? '…' : balance.toLocaleString() + ' coins'}
            </Text>
          </View>
          <CoinIcon size={40} />
        </View>

        {/* Info strip */}
        <View style={s.infoStrip}>
          <Text style={s.infoText}>
            Use coins to send gifts, unlock exclusive content, and subscribe to creators.
          </Text>
        </View>

        {/* Packs grid */}
        {loading ? (
          <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={s.sectionTitle}>{t('coinStore.select')}</Text>
            <View style={s.packsGrid}>
              {packs.map((pack) => {
                const isPopular = pack.id === 'popular' || pack.badge?.toLowerCase().includes('popular');
                const isBuying  = buying === pack.id;
                return (
                  <TouchableOpacity
                    key={pack.id}
                    style={[s.packCard, isPopular && s.packCardHighlight]}
                    onPress={() => handleBuy(pack)}
                    disabled={!!buying}
                    activeOpacity={0.75}
                  >
                    {pack.badge ? (
                      <View style={[s.packBadge, isPopular ? s.packBadgePopular : s.packBadgeDefault]}>
                        <Text style={[s.packBadgeText, isPopular && { color: '#fff' }]}>
                          {pack.badge}
                        </Text>
                      </View>
                    ) : null}

                    <CoinIcon size={36} style={{ marginBottom: 8 }} />
                    <Text style={[s.packCoins, isPopular && { color: C.accent }]}>
                      {fmtCoins(pack.coins)}
                    </Text>
                    <Text style={s.packCoinLabel}>coins</Text>
                    <Text style={s.packName}>{pack.name}</Text>
                    <TouchableOpacity
                      style={[s.packBtn, isPopular ? s.packBtnPrimary : s.packBtnDefault, buying && { opacity: 0.5 }]}
                      onPress={() => handleBuy(pack)}
                      disabled={!!buying}
                      activeOpacity={0.8}
                    >
                      {isBuying
                        ? <ActivityIndicator color={isPopular ? '#fff' : C.accent} size="small" />
                        : <Text style={[s.packBtnText, isPopular ? s.packBtnTextPrimary : s.packBtnTextDefault]}>
                            {fmtPrice(pack.amountCents)}
                          </Text>}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Secure note */}
        <View style={s.secureNote}>
          <Text style={s.secureIcon}>🔒</Text>
          <Text style={s.secureText}>
            Payments are processed securely by Stripe. Your card details never touch our servers.
          </Text>
        </View>

        {/* Terms */}
        <Text style={s.terms}>
          Coins are non-refundable and have no cash value outside the platform.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:              { flex: 1, backgroundColor: C.bg },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:           { width: 60 },
  headerTitle:       { fontSize: 17, fontWeight: '700', color: C.text },
  body:              { padding: 16, paddingBottom: 32, gap: 12 },

  balanceCard:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.accent, borderRadius: 20, padding: 20 },
  balanceLabel:      { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  balanceValue:      { fontSize: 22, fontWeight: '900', color: '#fff' },

  infoStrip:         { backgroundColor: C.bgCard, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  infoText:          { fontSize: 13, color: C.textMuted, lineHeight: 20 },

  sectionTitle:      { fontSize: 14, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  packsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  packCard:          { width: '47%', backgroundColor: C.bgCard, borderRadius: 18, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border, position: 'relative', overflow: 'hidden' },
  packCardHighlight: { borderColor: C.accent, borderWidth: 2, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },

  packBadge:         { position: 'absolute', top: 0, right: 0, borderBottomLeftRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  packBadgePopular:  { backgroundColor: C.accent },
  packBadgeDefault:  { backgroundColor: C.border },
  packBadgeText:     { fontSize: 10, fontWeight: '700', color: C.textMuted },

  packCoins:         { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 4 },
  packCoinLabel:     { fontSize: 11, color: C.textMuted, marginBottom: 4 },
  packName:          { fontSize: 12, fontWeight: '600', color: C.textMuted, marginBottom: 12 },

  packBtn:           { width: '100%', paddingVertical: 10, borderRadius: 12, alignItems: 'center', minHeight: 38 },
  packBtnPrimary:    { backgroundColor: C.accent },
  packBtnDefault:    { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  packBtnText:       { fontSize: 14, fontWeight: '800' },
  packBtnTextPrimary:{ color: '#fff' },
  packBtnTextDefault:{ color: C.accent },

  secureNote:        { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginTop: 4 },
  secureIcon:        { fontSize: 18, lineHeight: 22 },
  secureText:        { flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 18 },

  terms:             { fontSize: 11, color: C.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  flash:             { borderRadius: 14, padding: 16, borderWidth: 1 },
  flashOk:           { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  flashErr:          { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  flashText:         { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  flashDismiss:      { fontSize: 11, color: C.textMuted, marginTop: 4 },
});
