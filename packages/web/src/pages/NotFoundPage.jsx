/**
 * NotFoundPage — 404 fallback route.
 * https://milloapp.com
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { MilloCoin } from '../components/MilloCoin';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <>
      <SEO title={t('notFound.seoTitle')} description={t('notFound.seoDesc')} path="/404" />
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-16 text-center">

        {/* Large 404 */}
        <div className="relative mb-8">
          <p className="text-[120px] font-black text-[var(--accent)]/10 leading-none select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
              <svg className="w-12 h-12 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-[var(--text)] mb-3">{t('notFound.title')}</h1>
        <p className="text-[var(--text-muted)] max-w-sm mb-8 text-base leading-relaxed">
          {t('notFound.subtitle')}
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
            {t('notFound.goBack')}
          </button>
          <Link to="/"
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
            {t('notFound.goHome')}
          </Link>
          <Link to="/feed"
            className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
            {t('notFound.goDiscover')}
          </Link>
        </div>

        {/* Quick links */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg w-full">
          {[
            { to: '/live',   label: t('notFoundQuick.liveNow'),    emoji: '📡' },
            { to: '/coins',  label: t('notFoundQuick.coinStore'),   emoji: null, coinIcon: true },
            { to: '/search', label: t('notFoundQuick.search'),      emoji: '🔍' },
            { to: '/help',   label: t('notFoundQuick.helpCenter'),  emoji: '💬' },
          ].map(({ to, label, emoji, coinIcon }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-elevated)] transition-all group">
              {coinIcon ? <MilloCoin size={28} /> : <span className="text-2xl">{emoji}</span>}
              <span className="text-xs font-semibold text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
