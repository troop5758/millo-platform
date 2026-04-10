import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Switch, useColorScheme, ActivityIndicator,
  TextInput, Modal, Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { dark, light } from '../theme/colors';
import { get, post } from '../api/client';
import { MilloCoin } from '../components/MilloCoin';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticate,
  getBiometricTypes,
} from '../services/biometrics';

function Row({ label, value, valueNode, onPress, danger, C }) {
  const s = rowStyles(C);
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.label, danger && { color: C.red }]}>{label}</Text>
      {valueNode ?? (value != null ? <Text style={s.value}>{value}</Text> : <Text style={s.arrow}>›</Text>)}
    </TouchableOpacity>
  );
}
const rowStyles = (C) => StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 15, color: C.text },
  value: { fontSize: 14, color: C.textMuted },
  arrow: { fontSize: 18, color: C.textMuted },
});

/* ── Edit field modal ── */
function EditModal({ label, value, onSave, onClose, C }) {
  const { t } = useTranslation();
  const [val, setVal] = useState(value || '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: C.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 16 }}>{t('profile.editField', { label })}</Text>
          <TextInput
            value={val} onChangeText={setVal}
            style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 15, color: C.text, backgroundColor: C.bg, marginBottom: 16 }}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => { setBusy(true); await onSave(val.trim()); setBusy(false); onClose(); }}
              disabled={busy || !val.trim()}
              style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t('profile.saving') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ProfileScreen({ navigation }) {
  const scheme              = useColorScheme();
  const C                   = scheme === 'dark' ? dark : light;
  const { t }               = useTranslation();
  const { user, setUser, signOut } = useAuth();
  const [biometricEnabled,  setBiometric]  = useState(false);
  const [biometricAvail,    setBiometricA] = useState(false);
  const [biometricLabel,    setBioLabel]   = useState('');
  const [loading,           setLoading]    = useState(true);
  const [wallet,            setWallet]     = useState(null);
  const [editField,         setEditField]  = useState(null);
  const [saveError,         setSaveError]  = useState(null);
  const [bioMsg,            setBioMsg]     = useState(null); // { type: 'ok'|'err', text }
  const [signOutConfirm,    setSignOutConfirm] = useState(false);
  const [pwResetMsg,        setPwResetMsg] = useState(null); // { type, text }
  const [pwResetBusy,       setPwResetBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const avail = await isBiometricAvailable();
      const enabled = avail ? await isBiometricEnabled() : false;
      const types = avail ? await getBiometricTypes() : [];
      setBiometricA(avail);
      setBiometric(enabled);
      if (types.includes(2)) setBioLabel(t('profile.biometricFaceId'));
      else if (types.includes(1)) setBioLabel(t('profile.biometricFingerprint'));
      else setBioLabel(t('profile.biometricLabel'));
      // Fetch wallet balance
      get('/content/wallet')
        .then((d) => setWallet(d.balanceCents ?? 0))
        .catch((err) => console.warn('[ProfileScreen] wallet fetch failed:', err?.message));
      // Default label for when biometric type is undetermined but available
      if (avail && !types.includes(1) && !types.includes(2)) setBioLabel(t('profile.biometricLabel'));
      setLoading(false);
    })();
  }, []);

  const saveField = useCallback(async (key, value) => {
    setSaveError(null);
    try {
      const update = {};
      if (key === 'displayName') update.displayName = value;
      if (key === 'username')    update.username = value;
      await post('/profile/me', update);
      setUser((u) => u ? { ...u, [key]: value } : u);
    } catch (e) {
      setSaveError(e.message || t('profile.saveError'));
    }
  }, [setUser]);

  const handleChangePassword = useCallback(async () => {
    setPwResetMsg(null);
    setPwResetBusy(true);
    try {
      await post('/auth/password-reset/request', { email: user?.email });
      setPwResetMsg({ type: 'ok', text: t('profile.pwResetSent') });
    } catch (e) {
      setPwResetMsg({ type: 'err', text: e.message || t('profile.pwResetFailed') });
    } finally {
      setPwResetBusy(false);
    }
  }, [user?.email]);

  const handleBiometricToggle = async (newValue) => {
    setBioMsg(null);
    if (newValue) {
      const ok = await authenticate('Enable biometric sign-in for Millo');
      if (!ok) {
        setBioMsg({ type: 'err', text: t('profile.biometricAuthFailed') });
        return;
      }
      await setBiometricEnabled(true);
      setBiometric(true);
      setBioMsg({ type: 'ok', text: t('profile.biometricEnabledMsg') });
    } else {
      const ok = await authenticate('Disable biometric sign-in');
      if (!ok) return;
      await setBiometricEnabled(false);
      setBiometric(false);
    }
  };

  const handleSignOut = () => setSignOutConfirm(true);

  const s = styles(C);

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Save error banner */}
      {saveError && (
        <View style={s.errBanner}>
          <Text style={s.errBannerText}>{saveError}</Text>
          <TouchableOpacity onPress={() => setSaveError(null)}><Text style={s.bannerX}>✕</Text></TouchableOpacity>
        </View>
      )}
      {/* Password reset feedback */}
      {pwResetMsg && (
        <View style={[s.errBanner, pwResetMsg.type === 'ok' ? s.okBanner : {}]}>
          <Text style={[s.errBannerText, pwResetMsg.type === 'ok' && { color: '#15803d' }]}>
            {pwResetMsg.text}
          </Text>
          <TouchableOpacity onPress={() => setPwResetMsg(null)}><Text style={s.bannerX}>✕</Text></TouchableOpacity>
        </View>
      )}
      <ScrollView>
        {/* Avatar + name */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(user?.displayName || user?.email || 'U')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{user?.displayName || user?.email}</Text>
          <Text style={s.email}>{user?.email}</Text>
          {user?.emailVerified === false && (
            <View style={s.verifyBanner}>
              <Text style={s.verifyText}>{t('profile.emailNotVerified')}</Text>
            </View>
          )}
        </View>

        {/* Account */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('profile.sectionAccount')}</Text>
          <Row label={t('profile.displayName')}
            value={user?.displayName}
            onPress={() => setEditField({ key: 'displayName', label: t('profile.displayName'), value: user?.displayName })}
            C={C} />
          <Row label={t('profile.username')}
            value={user?.username ? `@${user.username}` : undefined}
            onPress={() => setEditField({ key: 'username', label: t('profile.username'), value: user?.username })}
            C={C} />
          <Row label={pwResetBusy ? t('common.sending') : t('profile.changePassword')} onPress={pwResetBusy ? undefined : handleChangePassword} C={C} />
          <Row label={t('profile.notificationsLabel')} onPress={() => navigation?.navigate?.('Notifications')} C={C} />
        </View>

        {/* Security */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('profile.sectionSecurity')}</Text>
          {biometricAvail && (
            <View style={[rowStyles(C).row, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: C.text }}>{biometricLabel || t('profile.biometricLabel')}</Text>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {biometricEnabled ? t('profile.biometricTapDisable') : t('profile.biometricTapEnable')}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ true: C.accent, false: C.border }}
                  thumbColor="#fff"
                />
              </View>
              {bioMsg && (
                <View style={[s.inlineBanner, bioMsg.type === 'err' ? s.inlineBannerErr : s.inlineBannerOk]}>
                  <Text style={[s.inlineBannerText, { color: bioMsg.type === 'err' ? '#dc2626' : '#15803d' }]}>
                    {bioMsg.text}
                  </Text>
                </View>
              )}
            </View>
          )}
          {!biometricAvail && (
            <View style={[rowStyles(C).row]}>
              <Text style={{ fontSize: 15, color: C.textMuted }}>{t('profile.biometricNotAvail')}</Text>
            </View>
          )}
          <Row label={t('profile.activeSessions')}
            onPress={() => Linking.openURL('https://milloapp.com/account/sessions')}
            C={C} />
        </View>

        {/* Wallet */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('profile.sectionWallet')}</Text>
          <Row label={t('profile.coins')}
            valueNode={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MilloCoin size={16} />
                <Text style={{ fontSize: 14, color: C.textMuted }}>
                  {wallet !== null ? wallet.toLocaleString() : '…'}
                </Text>
              </View>
            }
            onPress={() => navigation?.navigate?.('CoinStore')}
            C={C} />
          <Row label={t('profile.walletPayouts')}
            onPress={() => navigation?.navigate?.('Wallet')}
            C={C} />
        </View>

        {/* Privacy & Blocked */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('profile.sectionPrivacy', 'Privacy & Safety')}</Text>
          <Row label={t('profile.privacyData', 'Privacy & Data')}
            onPress={() => navigation?.navigate?.('PrivacySettings')}
            C={C} />
          <Row label={t('profile.blockedUsers', 'Blocked Users')}
            onPress={() => navigation?.navigate?.('BlockedUsers')}
            C={C} />
        </View>

        {/* Creator */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('profile.sectionCreator')}</Text>
          <Row label={t('profile.myShop')}
            onPress={() => navigation?.navigate?.('Shop')}
            C={C} />
          <Row label={t('profile.subscriptions')}
            onPress={() => navigation?.navigate?.('Subscriptions')}
            C={C} />
          <Row label={t('profile.analytics')}
            onPress={() => Linking.openURL('https://milloapp.com/dashboard')}
            C={C} />
          {(!user?.creatorStatus || user?.creatorStatus === 'none') && (
            <Row label={t('profile.applyCreator')}
              onPress={() => Linking.openURL('https://milloapp.com/creator-apply')}
              C={C} />
          )}
          {user?.creatorStatus === 'pending' && (
            <View style={[rowStyles(C).row, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
              <Text style={{ fontSize: 15, color: C.text }}>{t('profile.creatorPendingTitle')}</Text>
              <Text style={{ fontSize: 12, color: C.textMuted }}>{t('profile.creatorPendingDesc')}</Text>
            </View>
          )}
          {user?.creatorStatus === 'approved' && (
            <>
              <Row label={t('profile.goLive')}
                onPress={() => navigation?.navigate?.('GoLive')}
                C={C} />
              <Row label={t('profile.creatorDashboard')}
                onPress={() => Linking.openURL('https://milloapp.com/dashboard')}
                C={C} />
            </>
          )}
        </View>

        {/* Danger zone */}
        <View style={s.section}>
          <Row label={t('profile.logout')} onPress={handleSignOut} danger C={C} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {editField && (
        <EditModal
          label={editField.label}
          value={editField.value}
          onSave={(val) => saveField(editField.key, val)}
          onClose={() => setEditField(null)}
          C={C}
        />
      )}

      {/* Sign-out confirmation modal */}
      <Modal visible={signOutConfirm} transparent animationType="fade" onRequestClose={() => setSignOutConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.bgCard, borderRadius: 20, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 }}>{t('profile.signOutTitle')}</Text>
            <Text style={{ fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 }}>
              {t('profile.signOutDesc')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setSignOutConfirm(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', color: C.text }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSignOutConfirm(false); signOut(); }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>{t('profile.logout')}</Text>
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
  hero:         { alignItems: 'center', paddingVertical: 32, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar:       { width: 80, height: 80, borderRadius: 40, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:   { color: '#fff', fontWeight: '900', fontSize: 32 },
  name:         { fontSize: 20, fontWeight: '800', color: C.text },
  email:        { fontSize: 13, color: C.textMuted, marginTop: 2 },
  verifyBanner: { marginTop: 10, backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  verifyText:   { color: '#92400e', fontSize: 13, fontWeight: '600' },
  section:      { marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 4 },
  errBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fee2e2', paddingHorizontal: 16, paddingVertical: 10 },
  errBannerText:{ color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 },
  okBanner:     { backgroundColor: '#dcfce7' },
  bannerX:      { color: C.textMuted, fontSize: 16, paddingLeft: 10 },
  inlineBanner: { marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  inlineBannerErr: { backgroundColor: '#fee2e2' },
  inlineBannerOk:  { backgroundColor: '#dcfce7' },
  inlineBannerText:{ fontSize: 12, fontWeight: '600' },
});
