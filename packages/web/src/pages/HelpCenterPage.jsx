import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';

export function HelpCenterPage() {
  const { t } = useTranslation();

  const HELP_SECTIONS = [
    { id: 'getting-started', title: t('help.articles.gettingStarted'), body: t('help.articles.gettingStartedBody') },
    { id: 'gifts-and-coins', title: t('help.articles.giftsAndCoins'),  body: t('help.articles.giftsAndCoinsBody')  },
    { id: 'payouts',         title: t('help.articles.payouts'),         body: t('help.articles.payoutsBody')         },
    { id: 'safety',          title: t('help.articles.safety'),          body: t('help.articles.safetyBody')          },
    { id: 'tech',            title: t('help.articles.technicalIssues'), body: t('help.articles.technicalIssuesBody') },
  ];

  return (
    <>
      <SEO title={t('help.title')} description={t('help.seoDesc')} path="/help" />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[var(--text)]">{t('help.title')}</h1>
        <p className="mt-1 text-[var(--text-muted)]">{t('help.subtitle')}</p>
        <ul className="mt-10 space-y-4">
          {HELP_SECTIONS.map((s) => (
            <li key={s.id} id={s.id} className="card">
              <h2 className="text-xl font-semibold text-[var(--text)]">{s.title}</h2>
              <p className="mt-2 text-[var(--text-muted)]">{s.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          <Link to="/" className="text-[var(--accent)] hover:underline">{t('common.back')}</Link>
        </p>
      </div>
    </>
  );
}
