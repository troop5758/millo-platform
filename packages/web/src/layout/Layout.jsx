import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../components/ThemeToggle';
import { CookieConsent } from '../components/CookieConsent';
import {
  IconLive, IconSearch, IconUser, IconGlobe,
  IconFlash, IconMenu, IconX, IconTrendingUp, IconShoppingBag,
} from '../components/Icons';
import { LANGUAGES } from '../i18n';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { UserMenu } from '../components/UserMenu';
import { CartDrawer } from '../components/CartDrawer';
import { useCart } from '../context/CartContext';
import { getUser } from '../sdk/authApi';
import i18n from '../i18n';
import { getHeaderNavEntries, getUtilityNavEntries } from '../config/nav';
import { MarketingSiteHeader } from '../components/MarketingSiteHeader';

/* ── Language Switcher ── */
function LanguageSwitcher() {
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

  const select = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[var(--text-muted)] text-sm px-2 py-1.5 rounded-lg hover:bg-[var(--bg-card)] hover:text-[var(--text)] transition-colors"
        aria-label="Change language"
        aria-expanded={open}
      >
        <IconGlobe className="w-4 h-4" />
        <span className="font-medium">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)] overflow-hidden z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => select(lang.code)}
              className={'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ' +
                (lang.code === current.code
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--bg-card)]')}
            >
              <span className="text-base" aria-hidden>{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.code === current.code && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Layout ── */
export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [cartOpen,    setCartOpen]    = useState(false);
  const [user, setUser] = useState(() => getUser());
  const { totalItems } = useCart();

  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const ICON_MAP = {
    live: IconLive,
    flash: IconFlash,
    trending: IconTrendingUp,
    search: IconSearch,
    user: IconUser,
    store: IconShoppingBag,
  };

  const headerNav = getHeaderNavEntries(user).map((item) => ({
    ...item,
    label: t(item.labelKey),
    Icon: ICON_MAP[item.icon] || IconUser,
  }));

  const utilityNav = getUtilityNavEntries(user).map((item) => ({
    ...item,
    label: t(item.labelKey),
  }));

  /** One public nav for all guests — matches landing / discovery (no duplicate per-page headers). */
  const showMarketingGuestHeader = !user;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent', 'Skip to main content')}
      </a>
      {showMarketingGuestHeader ? (
        <MarketingSiteHeader />
      ) : (
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm shadow-[0_0_0_2px_var(--accent-subtle)] group-hover:opacity-90 transition-opacity">m</span>
            <span className="text-base font-bold tracking-tight text-[var(--text)]">millo</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {headerNav.map(({ to, label, Icon, labelKey, isActiveMatch }) => {
              const active = isActiveMatch
                ? isActiveMatch(location.pathname)
                : location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <Link key={`${to}-${labelKey}`} to={to}
                  className={'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ' +
                    (active ? 'text-[var(--text)] bg-[var(--bg-card)]' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)]')}>
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            <span className="w-px h-5 bg-[var(--border)] mx-1" />
            {utilityNav.map(({ to, label, hidden, labelKey }) => (
              <Link key={`${to}-${labelKey}`} to={to}
                className={'text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1.5 rounded transition-colors ' + (hidden ? 'hidden lg:inline' : '')}>
                {label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <Link to="/search" aria-label={t('nav.search')}
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
              <IconSearch className="w-4 h-4" />
            </Link>
            <NotificationDropdown />

            <LanguageSwitcher />
            <ThemeToggle />

            {/* Cart button */}
            <button type="button" onClick={() => setCartOpen(true)} aria-label="Cart"
              className="relative hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </button>

            <Link to="/coins"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-amber-500 border border-amber-500/30 hover:bg-amber-500/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t('nav.coins')}
            </Link>

            {user
              ? <UserMenu />
              : (
                <Link to="/login"
                  className="ml-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm">
                  {t('nav.login')}
                </Link>
              )}

            {/* Mobile menu toggle */}
            <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-label={t('nav.menu')}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              {mobileOpen ? <IconX className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 flex flex-col gap-1">
            {[...headerNav, ...utilityNav].map(({ to, label, labelKey }) => (
              <Link key={`${to}-${labelKey}`} to={to} onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
                {label}
              </Link>
            ))}
            {/* Language switcher in mobile drawer */}
            <div className="pt-2 border-t border-[var(--border)] mt-1">
              <p className="px-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{t('nav.language')}</p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {LANGUAGES.map((lang) => (
                  <button key={lang.code} type="button"
                    onClick={() => { i18n.changeLanguage(lang.code); setMobileOpen(false); }}
                    className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ' +
                      (lang.code === i18n.language
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]')}>
                    <span>{lang.flag}</span>
                    <span>{lang.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
      )}

      {/* Email verification banner */}
      {user && user.emailVerified === false && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{t('auth.verifyEmailBanner')}</span>
          </div>
          <Link to="/verify-email"
            className="shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400 underline hover:no-underline">
            {t('auth.verifyNow')}
          </Link>
        </div>
      )}

      <main id="main-content" className="flex-1 outline-none" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-elevated)] mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-10 text-xs text-[var(--text-muted)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            <div>
              <p className="text-[var(--text)] font-semibold text-sm mb-3">{t('footer.cols.discover', 'Discover')}</p>
              <ul className="space-y-2">
                <li><Link to="/feed" className="hover:text-[var(--text)] transition-colors">{t('nav.explore')}</Link></li>
                <li><Link to="/live" className="hover:text-[var(--text)] transition-colors">{t('nav.live')}</Link></li>
                <li><Link to="/creators" className="hover:text-[var(--text)] transition-colors">{t('nav.creators')}</Link></li>
                <li><Link to="/store" className="hover:text-[var(--text)] transition-colors">{t('nav.storefront')}</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[var(--text)] font-semibold text-sm mb-3">{t('footer.cols.account', 'Account')}</p>
              <ul className="space-y-2">
                <li><Link to="/pricing" className="hover:text-[var(--text)] transition-colors">{t('footer.pricing')}</Link></li>
                <li><Link to="/coins" className="hover:text-[var(--text)] transition-colors">{t('footer.buyCoins')}</Link></li>
                <li><Link to="/help" className="hover:text-[var(--text)] transition-colors">{t('footer.help')}</Link></li>
                <li><Link to="/support" className="hover:text-[var(--text)] transition-colors">{t('nav.support')}</Link></li>
              </ul>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <p className="text-[var(--text)] font-semibold text-sm mb-3">{t('footer.cols.legal', 'Legal & policies')}</p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                <li><Link to="/terms" className="hover:text-[var(--text)] transition-colors">{t('footer.terms')}</Link></li>
                <li><Link to="/privacy" className="hover:text-[var(--text)] transition-colors">{t('footer.privacy')}</Link></li>
                <li>
                  <a href="/legal/payments-policy.html" className="hover:text-[var(--text)] transition-colors">
                    {t('footer.paymentsPolicy')}
                  </a>
                </li>
                <li><Link to="/legal/dmca" className="hover:text-[var(--text)] transition-colors">{t('footer.dmca', 'DMCA')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-[var(--text-muted)]">© {new Date().getFullYear()} Millo Inc. {t('footer.rights')}</span>
            <a href="https://milloapp.com" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors font-medium">
              milloapp.com
            </a>
          </div>
        </div>
      </footer>
      <CookieConsent />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
