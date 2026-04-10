import React from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <>
      <SEO
        title={t('terms.title')}
        description={t('terms.seoDesc')}
        path="/terms"
      />
      <div className="max-w-2xl mx-auto prose prose-invert max-w-none">
        <h1 className="text-3xl font-bold">{t('terms.title')}</h1>
        <p className="text-[var(--muted)] mt-1">{t('terms.lastUpdated')}: 2025. https://milloapp.com</p>
        <section className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">{t('terms.s1Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s1Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s2Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s2Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s3Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s3Body')}</p>
          <p className="text-[var(--muted)] text-sm">
            <a href="/legal/payments-policy.html" className="text-[var(--accent)] hover:underline">Payments &amp; refunds policy</a>
            {' · '}
            <a href="/legal/dmca" className="text-[var(--accent)] hover:underline">DMCA form</a>
            {' · '}
            <a href="/legal/copyright.html" className="text-[var(--accent)] hover:underline">Copyright &amp; DMCA Policy</a>
          </p>
          <h2 className="text-xl font-semibold">{t('terms.s4Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s4Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s5Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s5Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s4Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s4Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s5Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s5Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s6Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s6Body')}</p>
          <h2 className="text-xl font-semibold">{t('terms.s7Heading')}</h2>
          <p className="text-[var(--muted)]">{t('terms.s7Body')}</p>
        </section>
      </div>
    </>
  );
}
