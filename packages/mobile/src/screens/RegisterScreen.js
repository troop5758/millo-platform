import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { register } from '../api/auth';
import { dark, light } from '../theme/colors';

export default function RegisterScreen({ navigation }) {
  const { setUser } = useAuth();
  const scheme      = useColorScheme();
  const C           = scheme === 'dark' ? dark : light;
  const { t }       = useTranslation();
  const [form,  setForm]  = useState({ email: '', password: '', displayName: '' });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleRegister = async () => {
    setError('');
    if (!form.email.trim() || !form.password) { setError(t('auth.register.required')); return; }
    if (form.password.length < 8) { setError(t('auth.register.passwordMin')); return; }
    setBusy(true);
    try {
      const data = await register(form.email.trim(), form.password, form.displayName.trim() || undefined);
      setUser(data.user);
    } catch (e) {
      setError(e.message || t('auth.register.failed'));
    }
    setBusy(false);
  };

  const s = styles(C);
  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={{ color: C.accent, fontSize: 15 }}>← {t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={s.title}>{t('auth.register.title')}</Text>
        <Text style={s.subtitle}>{t('auth.register.subtitle')}</Text>

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

        {[
          { key: 'displayName', label: t('auth.register.displayName'), placeholder: t('auth.register.displayNamePlaceholder'), type: 'default' },
          { key: 'email',       label: t('auth.login.email'),          placeholder: t('auth.login.emailPlaceholder'),           type: 'email-address' },
          { key: 'password',    label: t('auth.login.password'),       placeholder: t('auth.login.passwordPlaceholder'),        type: 'default', secure: true },
        ].map(({ key, label, placeholder, type, secure }) => (
          <View key={key} style={s.field}>
            <Text style={s.label}>{label}</Text>
            <TextInput style={s.input} value={form[key]} onChangeText={set(key)}
              placeholder={placeholder} placeholderTextColor={C.textMuted}
              keyboardType={type} autoCapitalize={key === 'email' ? 'none' : 'words'}
              secureTextEntry={!!secure} autoComplete={key === 'email' ? 'email' : key === 'password' ? 'new-password' : 'name'} />
          </View>
        ))}

        <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={handleRegister} disabled={busy} activeOpacity={0.8}>
          <Text style={s.btnText}>{busy ? t('auth.register.creating') : t('auth.register.create')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.linkRow}>
          <Text style={s.linkText}>{t('auth.register.alreadyHave')} <Text style={{ color: C.accent }}>{t('auth.register.signIn')}</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (C) => StyleSheet.create({
  flex:        { flex: 1, backgroundColor: C.bg },
  container:   { flexGrow: 1, padding: 24, paddingTop: 56 },
  back:        { marginBottom: 20 },
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
  linkRow:     { alignItems: 'center', marginTop: 20 },
  linkText:    { fontSize: 14, color: C.textMuted },
});
