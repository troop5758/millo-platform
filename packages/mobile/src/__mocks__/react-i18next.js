'use strict';
// Returns translation key as-is so tests can assert on key names
const t = (key, vars) => {
  if (!vars) return key;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
    key,
  );
};
module.exports = {
  useTranslation: () => ({ t, i18n: { language: 'en', changeLanguage: jest.fn() } }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  I18nextProvider: ({ children }) => children,
};
