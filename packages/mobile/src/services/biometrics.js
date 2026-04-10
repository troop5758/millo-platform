/**
 * biometrics.js — Expo LocalAuthentication wrapper.
 * Stores user preference in SecureStore.
 * https://milloapp.com
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_PREF_KEY = 'millo_biometric_enabled';

export async function isBiometricAvailable() {
  const hasHardware  = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled   = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function getBiometricTypes() {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return types; // [1 = fingerprint, 2 = facial, 3 = iris]
}

export async function isBiometricEnabled() {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
    return val === 'true';
  } catch { return false; }
}

export async function setBiometricEnabled(enabled) {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
}

/**
 * Prompt the user for biometric authentication.
 * @param {string} reason - Message shown to user
 * @returns {boolean} true if authenticated
 */
export async function authenticate(reason = 'Confirm your identity to continue') {
  const available = await isBiometricAvailable();
  if (!available) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:              reason,
    fallbackLabel:              'Use PIN',
    cancelLabel:                'Cancel',
    disableDeviceFallback:      false,
    requireConfirmation:        false,
  });

  return result.success === true;
}
