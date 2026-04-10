/**
 * ResetPasswordPage — handles /reset-password?token=…&uid=… (from email link)
 * and a standalone "forgot password" entry form. Recommends generated secure passwords.
 * https://milloapp.com
 */
import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { requestPasswordReset, confirmPasswordReset } from '../sdk/authApi';
import { generateSecurePassword } from '../lib/passwordGenerator';

export function ResetPasswordPage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { t }      = useTranslation();
  const token      = params.get('token');
  const uid        = params.get('uid');
  const isConfirm  = !!(token && uid);

  const [email,    setEmail]   = useState('');
  const [sent,     setSent]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [done,     setDone]     = useState(false);
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError(t('resetPassword.errorEmailRequired')); return; }
    setLoading(true); setError('');
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || t('resetPassword.errorRequestFailed'));
    }
    setLoading(false);
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError(t('resetPassword.errorPasswordLength')); return; }
    if (password !== confirm) { setError(t('resetPassword.errorPasswordMatch')); return; }
    setLoading(true); setError('');
    try {
      await confirmPasswordReset({ token, userId: uid, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError(err.message || t('resetPassword.errorResetFailed'));
    }
    setLoading(false);
  };

  return (
    <>
      <SEO title={t('resetPassword.forgotTitle')} description="Reset your Millo account password." path="/reset-password" />
      <div className="max-w-md mx-auto px-4 py-12">
        {!isConfirm ? (
          <>
            <h1 className="text-3xl font-bold text-[var(--text)]">{t('resetPassword.forgotTitle')}</h1>
            <p className="mt-1 text-[var(--text-muted)]">{t('resetPassword.forgotSubtitle')}</p>
            {sent ? (
              <div className="mt-8 p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <div className="font-semibold mb-1">{t('resetPassword.checkInbox')}</div>
                <p className="text-sm">{t('resetPassword.checkInboxDesc', { email })}</p>
                <Link to="/login" className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline">
                  {t('resetPassword.backToSignIn')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRequest} className="mt-8 card space-y-4">
                {error && <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{error}</div>}
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-[var(--text)] mb-1">
                    {t('resetPassword.emailLabel')}
                  </label>
                  <input id="reset-email" type="email" autoComplete="email"
                    placeholder={t('resetPassword.emailPlaceholder')}
                    value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                  {loading ? t('resetPassword.sending') : t('resetPassword.sendLink')}
                </button>
                <p className="text-sm text-center text-[var(--text-muted)]">
                  <Link to="/login" className="text-[var(--accent)] hover:underline">{t('resetPassword.backToSignIn')}</Link>
                </p>
              </form>
            )}
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[var(--text)]">{t('resetPassword.setPasswordTitle')}</h1>
            <p className="mt-1 text-[var(--text-muted)]">{t('resetPassword.setPasswordSubtitle')}</p>
            {done ? (
              <div className="mt-8 p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <div className="font-semibold mb-1">{t('resetPassword.passwordUpdatedTitle')}</div>
                <p className="text-sm">{t('resetPassword.passwordUpdatedDesc')}</p>
              </div>
            ) : (
              <form onSubmit={handleConfirm} className="mt-8 card space-y-4">
                {error && <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{error}</div>}
                <p className="text-xs text-[var(--text-muted)]">{t('resetPassword.generateHint', 'We recommend using a generated secure password and saving it in a password manager.')}</p>
                <div>
                  <label htmlFor="new-pw" className="block text-sm font-medium text-[var(--text)] mb-1">
                    {t('resetPassword.newPasswordLabel')}
                  </label>
                  <div className="flex gap-2">
                    <input id="new-pw" type="password" autoComplete="new-password"
                      placeholder={t('resetPassword.newPasswordPlaceholder')}
                      value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                    <button type="button" onClick={() => { const p = generateSecurePassword(16); setPassword(p); setConfirm(p); }} disabled={loading}
                      className="shrink-0 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] text-sm font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                      {t('resetPassword.generatePassword', 'Generate secure')}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-pw" className="block text-sm font-medium text-[var(--text)] mb-1">
                    {t('resetPassword.confirmPasswordLabel')}
                  </label>
                  <input id="confirm-pw" type="password" autoComplete="new-password"
                    placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                  {loading ? t('resetPassword.saving') : t('resetPassword.setPassword')}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
