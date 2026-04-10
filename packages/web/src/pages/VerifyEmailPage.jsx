/**
 * VerifyEmailPage — handles two routes:
 *   /verify-email?token=xxx  → verifies token via API, then redirects to success
 *   /verify-email/success    → success landing after verification
 *
 * Also shows a "resend" option if the user is logged in but not verified.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser, fetchMe } from '../sdk/authApi';
import { verifyEmail, resendVerificationEmail } from '../sdk/contentApi';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isSuccess      = window.location.pathname.includes('/success');
  const [sent,  setSent]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const user = getUser();

  useEffect(() => {
    if (!token || isSuccess) return;
    setVerifyBusy(true);
    setVerifyError('');
    verifyEmail(token)
      .then(async () => {
        await fetchMe();
        navigate('/verify-email/success', { replace: true });
      })
      .catch((e) => {
        setVerifyError(e.message || e.data?.error || t('verifyEmail.errVerify', 'Invalid or expired link'));
      })
      .finally(() => setVerifyBusy(false));
  }, [token, isSuccess, navigate, t]);

  const handleResend = async () => {
    setBusy(true); setError('');
    try {
      await resendVerificationEmail();
      setSent(true);
    } catch (e) {
      setError(e.message || t('verifyEmail.errSend'));
    }
    setBusy(false);
  };

  if (isSuccess) {
    return (
      <>
        <SEO title={t('verifyEmail.seoTitle')} description={t('verifyEmail.seoDesc')} path="/verify-email/success" />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('verifyEmail.verified')}</h1>
          <p className="text-[var(--text-muted)] mb-6">{t('verifyEmail.confirmedDesc')}</p>
          <Link to="/" className="inline-block px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-hover)] transition-colors">
            {t('verifyEmail.goToMillo')}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={t('verifyEmail.seoTitle')} description={t('verifyEmail.seoDesc')} path="/verify-email" />
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--accent)]/15 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('verifyEmail.title')}</h1>
        <p className="text-[var(--text-muted)] mb-6">
          {token && verifyBusy
            ? t('verifyEmail.verifying', 'Verifying…')
            : t('verifyEmail.desc', { email: user?.email || t('verifyEmail.yourEmail') })}
        </p>

        {verifyError && (
          <p className="text-red-500 text-sm mb-4">{verifyError}</p>
        )}

        {!token && (sent ? (
          <p className="text-emerald-500 font-medium mb-4">{t('verifyEmail.sent')}</p>
        ) : (
          <>
            <button type="button" onClick={handleResend} disabled={busy}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {busy ? t('verifyEmail.sending') : t('verifyEmail.resend')}
            </button>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </>
        ))}

        {token && verifyBusy && (
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
        )}

        <p className="mt-6 text-xs text-[var(--text-muted)]">
          <Link to="/" className="hover:underline">{t('verifyEmail.backToHome')}</Link>
        </p>
      </div>
    </>
  );
}
