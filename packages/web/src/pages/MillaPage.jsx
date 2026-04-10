import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../components/ComingSoon';
import { SEO } from '../components/SEO';
import { features } from '../config/features';

export function MillaPage() {
  const { t } = useTranslation();

  if (!features.milla) {
    return (
      <>
        <SEO
          title={t('milla.seoTitle')}
          description={t('milla.seoDesc')}
          path="/creator/milla"
        />
        <div className="min-h-[55vh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-[var(--bg)]">
          <ComingSoon label={t('milla.aiHostComingSoon')} className="max-w-md" />
          <p className="text-sm text-[var(--text-muted)] max-w-md">{t('milla.comingSoonDesc')}</p>
          <Link
            to="/feed"
            className="mt-4 px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-95"
          >
            {t('milla.browseFeed')}
          </Link>
        </div>
      </>
    );
  }

  const TAGS = [
    t('milla.tag0'), t('milla.tag1'), t('milla.tag2'),
    t('milla.tag3'), t('milla.tag4'),
  ];

  const AI_SPECS = [
    { label: t('milla.spec0Label'), value: t('milla.spec0Value') },
    { label: t('milla.spec1Label'), value: t('milla.spec1Value') },
    { label: t('milla.spec2Label'), value: t('milla.spec2Value') },
    { label: t('milla.spec3Label'), value: t('milla.spec3Value') },
    { label: t('milla.spec4Label'), value: t('milla.spec4Value') },
  ];

  const CAPABILITIES = [
    { icon: '🎥', title: t('milla.cap0Title'), desc: t('milla.cap0Desc') },
    { icon: '🛍', title: t('milla.cap1Title'), desc: t('milla.cap1Desc') },
    { icon: '💬', title: t('milla.cap2Title'), desc: t('milla.cap2Desc') },
    { icon: '🎁', title: t('milla.cap3Title'), desc: t('milla.cap3Desc') },
  ];

  return (
    <>
      <SEO
        title={t('milla.seoTitle')}
        description={t('milla.seoDesc')}
        path="/creator/milla"
      />
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">

          {/* Profile header */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="relative shrink-0">
              <div className="w-32 h-32 rounded-full border-2 border-[var(--border-strong)] bg-[var(--bg-elevated)] flex items-center justify-center">
                <span className="text-5xl select-none" aria-hidden>🤖</span>
              </div>
              <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-success)] text-[var(--text)]">AI</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-[var(--text)]">Milla</h1>
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/40">
                  ✓ {t('milla.aiCreator')}
                </span>
              </div>
              <p className="text-[var(--text-muted)] mt-0.5 text-sm">{t('milla.handle')}</p>
              <p className="text-[var(--text)]/90 text-sm mt-2 max-w-lg leading-relaxed">
                {t('milla.bio')}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {TAGS.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[var(--text)] text-xs font-medium">{tag}</span>
                ))}
              </div>
              <div className="flex gap-3 mt-5 flex-wrap">
                <Link to="/live"
                  className="px-5 py-2 rounded-xl bg-[var(--accent-success)] hover:opacity-90 text-[var(--text)] text-sm font-semibold transition-colors">
                  {t('milla.watchLive')}
                </Link>
                <Link to="/feed"
                  className="px-5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:bg-[var(--bg-card)] text-[var(--text)] text-sm font-semibold transition-colors">
                  {t('milla.browseFeed')}
                </Link>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <h2 className="text-lg font-bold text-[var(--text)] mb-4">{t('milla.whatMillaCan')}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <span className="text-2xl mb-3 block" aria-hidden>{c.icon}</span>
                  <p className="text-[var(--text)] font-semibold text-sm">{c.title}</p>
                  <p className="text-slate-300 text-xs mt-1 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Technical specs */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-bold text-[var(--text)] mb-4">{t('milla.techSpecs')}</h2>
            <dl className="space-y-3">
              {AI_SPECS.map((s) => (
                <div key={s.label} className="flex gap-4">
                  <dt className="shrink-0 text-xs font-semibold text-emerald-400 w-36">{s.label}</dt>
                  <dd className="text-xs text-slate-300 leading-relaxed">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* CTA */}
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-center">
            <p className="text-[var(--text)] font-bold text-base">{t('milla.ctaTitle')}</p>
            <p className="text-slate-300 text-sm mt-1">{t('milla.ctaDesc')}</p>
            <Link to="/help"
              className="mt-4 inline-block px-6 py-2.5 rounded-xl bg-[var(--accent-success)] hover:opacity-90 text-[var(--text)] text-sm font-semibold transition-colors">
              {t('milla.contactUs')}
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
