import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { useSellerOnboarding } from '../../hooks/useSellerOnboarding';
import KycWizard from '../../components/seller/KycWizard';
import DevStubBanner from '../../components/DevStubBanner';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { startStripeConnectOnboarding } from '../../sdk/sellerApi';

function SellerOnboardingContent() {
  const { t } = useTranslation();
  const { form, updateField, loading, saving, saved, error, save } = useSellerOnboarding();
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeErr, setStripeErr] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await save();
  };

  const openStripeConnect = useCallback(async () => {
    setStripeErr(null);
    setStripeBusy(true);
    try {
      const res = await startStripeConnectOnboarding();
      const url = res?.url;
      if (url && typeof url === 'string') {
        window.location.assign(url);
        return;
      }
      setStripeErr(t('sellerOnboarding.stripeErr'));
    } catch {
      setStripeErr(t('sellerOnboarding.stripeErr'));
    } finally {
      setStripeBusy(false);
    }
  }, [t]);

  const submissionNote = () => {
    switch (form.submissionState) {
      case 'in_review':
        return t('sellerOnboarding.stateInReview');
      case 'approved':
        return t('sellerOnboarding.stateApproved');
      case 'rejected':
        return t('sellerOnboarding.stateRejected');
      default:
        return t('sellerOnboarding.stateDraft');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">{t('sellerOnboarding.title')}</h1>

      <p className="text-sm text-[var(--text-muted)] mb-4">{t('sellerOnboarding.persistedHint')}</p>

      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text)]">
        {submissionNote()}
      </div>

      <DevStubBanner feature="Seller KYC" enabled={Boolean(form?.providerLive)} />

      {loading ? <p className="text-[var(--text-muted)]">{t('sellerOnboarding.loading')}</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load seller onboarding.'}
        </div>
      ) : null}

      {stripeErr ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 px-4 py-3 text-sm">
          {stripeErr}
        </div>
      ) : null}

      {!loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
          <KycWizard
            form={form}
            updateField={updateField}
            onSubmit={handleSubmit}
            saving={saving}
            saved={saved}
          />

          {form.stripeConnectOffered ? (
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-sm text-[var(--text-muted)] mb-3">{t('sellerOnboarding.stripeBlurb')}</p>
              <button
                type="button"
                disabled={stripeBusy}
                onClick={() => openStripeConnect().catch(() => {})}
                className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] px-4 py-2 font-semibold text-sm hover:bg-[var(--bg)] disabled:opacity-50"
              >
                {stripeBusy ? t('sellerOnboarding.stripeOpening') : t('sellerOnboarding.stripePayouts')}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 text-sm">
            <Link to="/help" className="text-[var(--accent)] font-medium hover:underline">
              {t('nav.help')}
            </Link>
            <Link to="/feed" className="text-[var(--text-muted)] hover:text-[var(--text)]">
              {t('nav.home')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SellerOnboardingPage() {
  return (
    <>
      <SEO title="Seller onboarding" path="/seller/onboarding" />
      <ProtectedRoute>
        <SellerOnboardingContent />
      </ProtectedRoute>
    </>
  );
}
