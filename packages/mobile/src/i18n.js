/**
 * i18n — react-i18next configuration for Millo mobile.
 * Languages: en (default), es, fr, pt, ar (RTL).
 * Language preference is persisted via AsyncStorage under 'millo_lang'.
 * https://milloapp.com
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

export const LANGUAGES = [
  { code: 'en', label: 'English',   flag: '🇬🇧', rtl: false },
  { code: 'es', label: 'Español',   flag: '🇪🇸', rtl: false },
  { code: 'fr', label: 'Français',  flag: '🇫🇷', rtl: false },
  { code: 'pt', label: 'Português', flag: '🇧🇷', rtl: false },
  { code: 'ar', label: 'العربية',   flag: '🇸🇦', rtl: true  },
];

const STORAGE_KEY = 'millo_lang';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      pt: { translation: pt },
      ar: { translation: ar },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

/** Load persisted language from AsyncStorage and apply it. */
export async function loadPersistedLanguage() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.find((l) => l.code === stored)) {
      await changeLanguage(stored);
    }
  } catch {
    /* silent */
  }
}

/** Change language and persist to AsyncStorage. */
export async function changeLanguage(code) {
  const lang = LANGUAGES.find((l) => l.code === code);
  if (!lang) return;
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch { /* silent */ }
  // RTL layout requires app restart on React Native; flag is set for next launch
  if (I18nManager.isRTL !== lang.rtl) {
    I18nManager.allowRTL(lang.rtl);
    I18nManager.forceRTL(lang.rtl);
  }
}

export default i18n;
