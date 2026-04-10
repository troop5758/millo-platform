import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ThemeToggle';
import { IconGlobe, IconChevronDown, IconMenu, IconX } from './Icons';
import { LANGUAGES } from '../i18n';
import i18n from '../i18n';
import { getMarketingNavEntries } from '../config/nav';

function LandingLanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition-colors"
        aria-label="Change language"
        aria-expanded={open}
      >
        <IconGlobe className="w-4 h-4" />
        <span className="font-medium">{current.label}</span>
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)] overflow-hidden z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setOpen(false);
              }}
              className={
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ' +
                (lang.code === current.code
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--bg-card)]')
              }
            >
              <span className="text-base" aria-hidden>
                {lang.flag}
              </span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Public site header — same bar on landing and every guest route under Layout.
 * Navigation is driven by getMarketingNavEntries() so links stay aligned with the app shell.
 * Solid colors only (no gradients). https://milloapp.com
 */
export function MarketingSiteHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = location.pathname;
  const [mobileNav, setMobileNav] = useState(false);

  const NAV = getMarketingNavEntries();

  const navLink = (active) =>
    `text-sm font-medium transition-colors ${
      active ? 'text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-[var(--shadow-md)] bg-[var(--accent-premium)] group-hover:opacity-90 transition-opacity">
            m
          </span>
          <span className="text-lg font-bold tracking-tight text-[var(--text)]">millo</span>
        </Link>

        <nav
          className="hidden lg:flex items-center gap-4 xl:gap-6 absolute left-1/2 -translate-x-1/2 max-w-[min(100vw-16rem,44rem)] flex-wrap justify-center"
          aria-label={t('nav.menu')}
        >
          {NAV.map(({ to, labelKey, isActiveMatch }) => (
            <Link key={`${to}-${labelKey}`} to={to} className={navLink(isActiveMatch(pathname))}>
              {t(labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:block">
            <LandingLanguageSwitcher />
          </div>
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm font-semibold text-[var(--text-muted)] px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-card)] hover:text-[var(--text)] transition-colors"
          >
            {t('nav.login')}
          </Link>
          <Link
            to="/signup"
            className="hidden sm:inline-flex text-sm font-semibold text-white px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
          >
            {t('nav.signup')}
          </Link>
          <ThemeToggle />
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl border border-[var(--border)] text-[var(--text)]"
            aria-label={mobileNav ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav((v) => !v)}
          >
            {mobileNav ? <IconX className="w-6 h-6" /> : <IconMenu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileNav && (
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4 flex flex-col gap-1">
          {NAV.map(({ to, labelKey }) => (
            <Link
              key={`${to}-${labelKey}`}
              to={to}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors font-medium py-2.5 px-1 rounded-lg hover:bg-[var(--bg-card)]"
              onClick={() => setMobileNav(false)}
            >
              {t(labelKey)}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-[var(--border)]">
            <Link
              to="/login"
              className="text-sm font-semibold text-center py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)]"
              onClick={() => setMobileNav(false)}
            >
              {t('nav.login')}
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold text-center py-2.5 rounded-xl bg-[var(--accent)] text-white"
              onClick={() => setMobileNav(false)}
            >
              {t('nav.signup')}
            </Link>
          </div>
          <div className="pt-3">
            <LandingLanguageSwitcher />
          </div>
        </div>
      )}
    </header>
  );
}
