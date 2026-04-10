import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';

const STORAGE_KEY = 'millo_cookie_consent';

export function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, at: new Date().toISOString() }));
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: false, at: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[var(--bg)] border-t border-[var(--muted)]/30 shadow-lg"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-4 items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          <Trans i18nKey="cookie.message" components={{ privacyLink: <Link to="/privacy" className="underline hover:no-underline" /> }} />
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className="px-4 py-2 rounded-lg border border-[var(--muted)]/50 hover:bg-[var(--muted)]/10 text-sm"
          >
            {t('cookie.decline')}
          </button>
          <button
            type="button"
            onClick={accept}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:opacity-90"
          >
            {t('cookie.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
