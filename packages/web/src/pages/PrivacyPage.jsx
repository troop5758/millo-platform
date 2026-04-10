import React from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <>
      <SEO
        title={t('privacy.title')}
        description={t('privacy.seoDesc')}
        path="/privacy"
      />
      <div className="max-w-2xl mx-auto prose prose-invert max-w-none">
        <h1 className="text-3xl font-bold">{t('privacy.title')}</h1>
        <p className="text-[var(--muted)] mt-1">{t('privacy.lastUpdated')}: 2025. https://milloapp.com</p>
        <section className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">{t('privacy.s1Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s1Body')}</p>
          <h2 className="text-xl font-semibold">{t('privacy.s2Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s2Body')}</p>
          <h2 className="text-xl font-semibold">{t('privacy.s3Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s3Body')}</p>
          <h2 className="text-xl font-semibold">{t('privacy.s4Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s4Body')}</p>
          <h2 className="text-xl font-semibold">{t('privacy.s5Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s5Body')}</p>
          <h2 className="text-xl font-semibold">{t('privacy.s6Heading')}</h2>
          <p className="text-[var(--muted)]">{t('privacy.s6Body')}</p>
        </section>
      </div>
    </>
  );
}
