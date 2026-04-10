/**
 * i18n — react-i18next configuration.
 * Languages: en (default), es, fr, pt, ar (RTL).
 * Language preference is persisted to localStorage under 'millo_lang'.
 * https://milloapp.com
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

/** Deep-merge English under each locale so missing keys fall back to en at runtime. */
function deepMergeFallback(base, overlay) {
  if (overlay == null || typeof overlay !== 'object' || Array.isArray(overlay)) return base;
  if (base == null || typeof base !== 'object' || Array.isArray(base)) return overlay;
  const out = { ...base };
  for (const key of Object.keys(overlay)) {
    const b = base[key];
    const o = overlay[key];
    if (o !== null && typeof o === 'object' && !Array.isArray(o) && b !== null && typeof b === 'object' && !Array.isArray(b)) {
      out[key] = deepMergeFallback(b, o);
    } else {
      out[key] = o;
    }
  }
  return out;
}

export const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', label: 'Español',    flag: '🇪🇸', dir: 'ltr' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷', dir: 'ltr' },
  { code: 'pt', label: 'Português',  flag: '🇧🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية',    flag: '🇸🇦', dir: 'rtl' },
];

const STORAGE_KEY = 'millo_lang';

function detectLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LANGUAGES.find((l) => l.code === stored)) return stored;
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  if (browser && LANGUAGES.find((l) => l.code === browser)) return browser;
  return 'en';
}

/** Apply RTL/LTR direction to <html> element. */
export function applyDirection(code) {
  const lang = LANGUAGES.find((l) => l.code === code);
  document.documentElement.dir  = lang?.dir  || 'ltr';
  document.documentElement.lang = code;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: deepMergeFallback(en, es) },
      fr: { translation: deepMergeFallback(en, fr) },
      pt: { translation: deepMergeFallback(en, pt) },
      ar: { translation: deepMergeFallback(en, ar) },
    },
    lng: detectLanguage(),
    fallbackLng: ['en'],
    supportedLngs: ['en', 'es', 'fr', 'pt', 'ar'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
  });

/* Persist language changes and update DOM direction. */
i18n.on('languageChanged', (code) => {
  localStorage.setItem(STORAGE_KEY, code);
  applyDirection(code);
});

/* Apply direction on initial load. */
applyDirection(i18n.language);

export default i18n;
