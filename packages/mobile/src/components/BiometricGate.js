/**
 * BiometricGate — wraps the app and requires biometric auth after 5 min background.
 * Only activates if user has biometric sign-in enabled.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, AppState } from 'react-native';
import { isBiometricEnabled, authenticate } from '../services/biometrics';
import { dark, light } from '../theme/colors';

const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes

export function BiometricGate({ children }) {
  const scheme        = useColorScheme();
  const C             = scheme === 'dark' ? dark : light;
  const [locked,      setLocked]   = useState(false);
  const [error,       setError]    = useState('');
  const backgroundAt  = useRef(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundAt.current = Date.now();
      } else if (nextState === 'active') {
        const away = Date.now() - (backgroundAt.current || 0);
        if (away >= LOCK_AFTER_MS) {
          const enabled = await isBiometricEnabled();
          if (enabled) setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = async () => {
    setError('');
    const ok = await authenticate('Unlock Millo');
    if (ok) { setLocked(false); }
    else { setError('Authentication failed. Try again.'); }
  };

  if (!locked) return children;

  const s = styles(C);
  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <View style={s.iconBox}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
        </View>
        <Text style={s.title}>Millo is locked</Text>
        <Text style={s.subtitle}>Authenticate to continue</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <TouchableOpacity style={s.btn} onPress={unlock} activeOpacity={0.85}>
          <Text style={s.btnText}>Unlock with Biometrics</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (C) => StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:     { alignItems: 'center', width: '100%', maxWidth: 340 },
  iconBox:  { width: 80, height: 80, borderRadius: 24, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title:    { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textMuted, marginBottom: 24 },
  error:    { fontSize: 13, color: C.red, marginBottom: 12 },
  btn:      { width: '100%', backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
