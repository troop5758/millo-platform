import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, useColorScheme, ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { login } from '../api/auth';
import { saveToken } from '../api/client';
import { dark, light } from '../theme/colors';

const API_BASE = Constants.expoConfig?.extra?.apiUrl ?? 'https://api.milloapp.com';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const { setUser }    = useAuth();
  const scheme         = useColorScheme();
  const C              = scheme === 'dark' ? dark : light;
  const { t }          = useTranslation();
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [busy,       setBusy]       = useState(false);
  const [socialBusy, setSocialBusy] = useState(null); // 'google' | 'facebook' | null
  const [error,      setError]      = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email.trim() || !password) { setError(t('auth.login.required')); return; }
    setBusy(true);
    try {
      const data = await login(email.trim(), password);
      setUser(data.user);
    } catch (e) {
      setError(e.message || t('auth.login.failed'));
    }
    setBusy(false);
  };

  const handleSocialLogin = async (provider) => {
    setError('');
    setSocialBusy(provider);
    try {
      // Build the OAuth redirect URL — the callback will deep-link back to the app
      const redirectUri = Linking.createURL('/oauth-callback');
      const authUrl     = `${API_BASE}/auth/oauth/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Parse token and user from deep-link query params
        const parsed = Linking.parse(result.url);
        const token  = parsed.queryParams?.token;
        const userB64 = parsed.queryParams?.user;

        if (token) {
          await saveToken(token);
          const user = userB64 ? JSON.parse(decodeURIComponent(userB64)) : { token };
          setUser(user);
        } else {
          const errorParam = parsed.queryParams?.error || '';
          const isNotConfigured = ['not_configured', 'not_implemented', 'not_supported'].includes(errorParam);
          setError(isNotConfigured ? t('auth.login.oauthNotConfigured') : t('auth.login.oauthFailed'));
        }
      } else if (result.type === 'cancel') {
        // User closed the browser — no error
      } else {
        setError(t('auth.login.oauthFailed'));
      }
    } catch (e) {
      const msg = e.message || '';
      const isNotConfigured = msg.includes('501') || msg.toLowerCase().includes('not implemented') || msg.toLowerCase().includes('not configured');
      setError(isNotConfigured ? t('auth.login.oauthNotConfigured') : (msg || t('auth.login.socialFailed')));
    }
    setSocialBusy(null);
  };

  const s = styles(C);
  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoBox}>
            <Text style={s.logoText}>m</Text>
          </View>
          <Text style={s.logoLabel}>Millo</Text>
        </View>

        <Text style={s.title}>{t('auth.login.title')}</Text>
        <Text style={s.subtitle}>{t('auth.login.subtitle')}</Text>

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

        <View style={s.field}>
          <Text style={s.label}>{t('auth.login.email')}</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail}
            placeholder={t('auth.login.emailPlaceholder')} placeholderTextColor={C.textMuted}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </View>

        <View style={s.field}>
          <Text style={s.label}>{t('auth.login.password')}</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword}
            placeholder={t('auth.login.passwordPlaceholder')} placeholderTextColor={C.textMuted}
            secureTextEntry autoComplete="password" />
        </View>

        <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={handleLogin} disabled={busy} activeOpacity={0.8}>
          <Text style={s.btnText}>{busy ? t('auth.login.signingIn') : t('auth.login.signIn')}</Text>
        </TouchableOpacity>

        {/* Social login */}
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>{t('auth.login.orContinueWith')}</Text>
          <View style={s.dividerLine} />
        </View>

        <View style={s.socialRow}>
          <TouchableOpacity style={s.socialBtn} activeOpacity={0.8}
            onPress={() => handleSocialLogin('google')}
            disabled={!!socialBusy}>
            {socialBusy === 'google'
              ? <ActivityIndicator size="small" color={C.accent} />
              : <Text style={[s.socialBtnText, { color: C.text }]}>G  Google</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.socialBtn} activeOpacity={0.8}
            onPress={() => handleSocialLogin('facebook')}
            disabled={!!socialBusy}>
            {socialBusy === 'facebook'
              ? <ActivityIndicator size="small" color={C.accent} />
              : <Text style={[s.socialBtnText, { color: C.text }]}>f  Facebook</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={s.linkRow}>
          <Text style={s.linkText}>{t('auth.login.noAccount')} <Text style={{ color: C.accent }}>{t('auth.login.createOne')}</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (C) => StyleSheet.create({
  flex:        { flex: 1, backgroundColor: C.bg },
  container:   { flexGrow: 1, padding: 24, paddingTop: 60 },
  logoWrap:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBox:     { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  logoText:    { color: '#fff', fontWeight: '900', fontSize: 20 },
  logoLabel:   { fontSize: 22, fontWeight: '800', color: C.text },
  title:       { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 4 },
  subtitle:    { fontSize: 15, color: C.textMuted, marginBottom: 28 },
  errorBox:    { backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText:   { color: '#dc2626', fontSize: 13 },
  field:       { marginBottom: 16 },
  label:       { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 6 },
  input:       { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, backgroundColor: C.bgCard },
  btn:         { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, color: C.textMuted },
  socialRow:   { flexDirection: 'row', gap: 12, marginBottom: 24 },
  socialBtn:   { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: C.bgCard },
  socialBtnText:{ fontSize: 14, fontWeight: '600' },
  linkRow:     { alignItems: 'center', marginTop: 8 },
  linkText:    { fontSize: 14, color: C.textMuted },
});
