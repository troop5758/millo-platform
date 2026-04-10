import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconMoon, IconSun } from './Icons';

/** Default is dark (TikTok-style). Toggling adds/removes .light on html. */
export function ThemeToggle({ compact = false }) {
  const { t } = useTranslation();
  const [light, setLight] = React.useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('light');
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (light) root.classList.add('light');
    else root.classList.remove('light');
  }, [light]);

  return (
    <button
      type="button"
      onClick={() => setLight((l) => !l)}
      className={
        compact
          ? 'p-2 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors'
          : 'px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]'
      }
      aria-label={light ? t('theme.ariaLight') : t('theme.ariaDark')}
    >
      {compact ? (
        light ? <IconMoon className="w-5 h-5" /> : <IconSun className="w-5 h-5" />
      ) : light ? (
        t('theme.switchDark')
      ) : (
        t('theme.switchLight')
      )}
    </button>
  );
}
