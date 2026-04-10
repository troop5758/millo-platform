/**
 * PrivacySettingsScreen — DSAR export, account deletion.
 * Uses GET /dsar/export, POST /dsar/delete
 * https://milloapp.com
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, useColorScheme,
  Share, Platform, Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { get, post } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { dark, light } from '../theme/colors';

export default function PrivacySettingsScreen({ navigation }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? dark : light;
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const s = styles(C);

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      const data = await get('/dsar/export');
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `millo-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({
          message: json.slice(0, 10000) + (json.length > 10000 ? '\n…(truncated)' : ''),
          title: t('privacy.exportTitle', 'My Millo Data'),
        });
      }
      setMsg({ type: 'ok', text: t('privacy.exportSuccess', 'Data export ready') });
    } catch (e) {
      setMsg({ type: 'err', text: e?.message || t('common.error') });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = () => {
    Alert.alert(
      t('privacy.deleteTitle', 'Delete account'),
      t('privacy.deleteDesc', 'This will permanently delete your account and all data. This cannot be undone.'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('privacy.deleteConfirm', 'Delete my account'),
          style: 'destructive',
          onPress: () => setDeleteConfirm(true),
        },
      ]
    );
  };

  const handleDelete = async () => {
    setDeleting(true);
    setMsg(null);
    try {
      await post('/dsar/delete', { confirm: true });
      setDeleteConfirm(false);
      signOut();
    } catch (e) {
      setMsg({ type: 'err', text: e?.message || t('common.error') });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('privacy.title', 'Privacy & Data')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {msg && (
        <View style={[s.banner, msg.type === 'ok' ? s.okBanner : s.errBanner]}>
          <Text style={[s.bannerText, msg.type === 'ok' && { color: '#15803d' }]}>{msg.text}</Text>
          <TouchableOpacity onPress={() => setMsg(null)}><Text style={s.bannerX}>✕</Text></TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('privacy.exportTitle', 'Download my data')}</Text>
          <Text style={s.cardSub}>{t('privacy.exportDesc', 'Get a copy of your data (profile, messages, purchases, etc.) in JSON format.')}</Text>
          <TouchableOpacity
            style={[s.btn, exporting && { opacity: 0.5 }]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.btnText}>{t('privacy.export', 'Export my data')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={[s.card, s.dangerCard]}>
          <Text style={s.cardTitle}>{t('privacy.deleteTitle', 'Delete account')}</Text>
          <Text style={s.cardSub}>{t('privacy.deleteDesc', 'Permanently delete your account and all associated data. This cannot be undone.')}</Text>
          <TouchableOpacity
            style={[s.btnDanger, deleting && { opacity: 0.5 }]}
            onPress={handleDeleteRequest}
            disabled={deleting}
          >
            <Text style={s.btnDangerText}>{t('privacy.deleteAccount', 'Delete my account')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {deleteConfirm && (
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('privacy.deleteFinalTitle', 'Are you sure?')}</Text>
            <Text style={s.dialogBody}>{t('privacy.deleteFinalDesc', 'Your account and all data will be permanently deleted.')}</Text>
            <View style={s.dialogRow}>
              <TouchableOpacity style={s.dialogCancel} onPress={() => setDeleteConfirm(false)}>
                <Text style={s.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogConfirm} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dialogConfirmText}>{t('privacy.deleteConfirm', 'Delete')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = (C) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back:       { width: 40, justifyContent: 'center' },
  backArrow:  { fontSize: 28, color: C.text, lineHeight: 32 },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: C.text },
  banner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  okBanner:   { backgroundColor: '#dcfce7' },
  errBanner:  { backgroundColor: '#fee2e2' },
  bannerText: { color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 },
  bannerX:    { color: C.textMuted, fontSize: 16, paddingLeft: 10 },
  body:       { padding: 16, paddingBottom: 40 },
  card:       { backgroundColor: C.bgCard, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  dangerCard: { borderColor: '#fecaca' },
  cardTitle:  { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  cardSub:    { fontSize: 13, color: C.textMuted, lineHeight: 20, marginBottom: 16 },
  btn:        { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDanger:  { backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnDangerText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog:     { backgroundColor: C.bgCard, borderRadius: 20, padding: 24, width: '100%' },
  dialogTitle:{ fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 },
  dialogBody: { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 20 },
  dialogRow:   { flexDirection: 'row', gap: 12 },
  dialogCancel:{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  dialogCancelText: { fontWeight: '600', color: C.text },
  dialogConfirm: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  dialogConfirmText: { fontWeight: '700', color: '#fff' },
});
